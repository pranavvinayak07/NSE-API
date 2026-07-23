import 'dotenv/config';
import { prisma } from '../lib/db';
import { fetchMasterChainInfo, fetchOptionChainData, calcATM, getStrikesForRange, DEFAULT_EXPIRY, NIFTY_STEP } from '../lib/nse';

async function main() {
  console.log('Simulating a backup...');
  try {
    const { spot, expiries, fullData } = await fetchMasterChainInfo();
    const expiry = expiries.length > 0 ? expiries[0] : null;
    if (!expiry) { console.error('No expiry available'); return; }
    let atmStrike = 23400;
    if (spot) {
      atmStrike = calcATM(spot, NIFTY_STEP);
    }
    const strikes = getStrikesForRange(atmStrike, 15, NIFTY_STEP);

    console.log(`Fetching option chain for ${expiry} around strike ${atmStrike}...`);
    const rows = await fetchOptionChainData(expiry, strikes, undefined, fullData);

    const enrichedRows = rows.map((row) => {
      const fA = (row.ceHigh !== null && row.peLow !== null) ? (row.ceHigh + row.peLow) / 2 : null; // PE-S
      const fB = (row.ceLow !== null && row.peHigh !== null) ? (row.ceLow + row.peHigh) / 2 : null; // CE-S
      const diff = fA !== null && fB !== null ? fA - fB : null;
      const avg = fA !== null && fB !== null ? (fA + fB) / 2 : null;
      
      return {
        ...row,
        peS: fA,
        ceS: fB,
        difference: diff,
        average: avg,
      };
    });

    const backup = await prisma.optionChainBackup.create({
      data: {
        timestamp: new Date(),
        underlyingValue: spot,
        atmStrike,
        expiry: expiry!,
        availableExpiries: expiries,
        data: JSON.parse(JSON.stringify(enrichedRows))
      }
    });

    console.log(`Backup created successfully. ID: ${backup.id}`);
  } catch (error) {
    console.error('Error creating backup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
