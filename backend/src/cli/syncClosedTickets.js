import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { FionaClient } from '../services/fionaClient.js';
import { createClosedTicketRepository } from '../repositories/closedTicketRepository.js';
import { parseDateRangeValue, syncClosedTickets } from '../services/closedTicketSync.js';

export function parseArgs(args) {
  const options = { serviceGroups: [], refreshExisting: false, storeId: 'alexandroupoli' };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--refresh-existing') {
      options.refreshExisting = true;
      continue;
    }
    if (!['--from-date', '--to-date', '--service-group', '--store', '--export-json'].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    index += 1;
    if (argument === '--service-group') options.serviceGroups.push(value);
    else if (argument === '--store') options.storeId = value;
    else if (argument === '--export-json') options.exportJson = value;
    else options[argument === '--from-date' ? 'fromDate' : 'toDate'] = parseDateRangeValue(value);
  }

  if (!options.fromDate || !options.toDate) {
    throw new Error('Usage: npm run sync:closed -- --from-date DD.MM.YYYY --to-date DD.MM.YYYY [--store STORE_ID] [--service-group ID] [--export-json FILE]');
  }
  if (options.fromDate > options.toDate) throw new Error('--from-date cannot be after --to-date');
  if (!config.fionaStores.some((store) => store.storeId === options.storeId)) throw new Error(`Unknown Fiona store: ${options.storeId}`);
  if (!options.serviceGroups.length) {
    const store = config.fionaStores.find((entry) => entry.storeId === options.storeId);
    options.serviceGroups = store.closedServiceGroups.length ? store.closedServiceGroups : config.closedTicketServiceGroups;
  }
  return options;
}

export async function writeClosedTicketExport({ repository, fromDate, toDate, storeId, outputPath }) {
  const from = fromDate.toISOString();
  const to = new Date(Date.UTC(
    toDate.getUTCFullYear(),
    toDate.getUTCMonth(),
    toDate.getUTCDate() + 1,
  )).toISOString();
  const records = repository.exportClosedBetween(from, to);
  const formatDate = (value) => [
    String(value.getUTCDate()).padStart(2, '0'),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    value.getUTCFullYear(),
  ].join('.');
  const data = {
    storeId,
    fromDate: formatDate(fromDate),
    toDate: formatDate(toDate),
    count: records.length,
    records,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return records.length;
}

export async function run(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  const store = config.fionaStores.find((entry) => entry.storeId === options.storeId);
  if (!store.configured) throw new Error(`Fiona store is not configured: ${options.storeId}`);
  const formatDate = (value) => [
    String(value.getUTCDate()).padStart(2, '0'),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    value.getUTCFullYear(),
  ].join('.');

  console.log('Fiona closed-ticket sync');
  console.log(`Script: ${fileURLToPath(import.meta.url)}`);
  console.log(`Range: ${formatDate(options.fromDate)} to ${formatDate(options.toDate)} (inclusive)`);
  console.log(`Service groups: ${options.serviceGroups.join(', ')}`);
  console.log(`Store: ${options.storeId}`);
  console.log(`Database: ${config.closedTicketsDbPath}`);

  const repository = createClosedTicketRepository(config.closedTicketsDbPath, options.storeId);
  try {
    const summary = await syncClosedTickets({
      ...options,
      serviceGroupMatch: store.closedServiceGroupMatch,
      client: new FionaClient(store),
      repository,
      onProgress: (message) => console.log(message),
    });
    console.log('\nSync summary:');
    console.log(JSON.stringify(summary, null, 2));
    if (options.exportJson) {
      const outputPath = path.resolve(options.exportJson);
      const exported = await writeClosedTicketExport({
        repository,
        fromDate: options.fromDate,
        toDate: options.toDate,
        storeId: options.storeId,
        outputPath,
      });
      console.log(`Exported ${exported} tickets to ${outputPath}`);
    }
    if (summary.failed > 0) process.exitCode = 1;
    return summary;
  } finally {
    repository.close();
  }
}

const entryPoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (entryPoint) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}