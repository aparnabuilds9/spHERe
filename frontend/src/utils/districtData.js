/**
 * src/utils/districtData.js
 * 
 * Client-side loader and parser for Layer B: NCRB District Crime Data.
 * Uses PapaParse to dynamically parse src/data/kanpur_crimes_women.csv.
 * Never hard-codes crime numbers.
 */

import Papa from 'papaparse';
import rawCsv from '../data/kanpur_crimes_women.csv?raw';

/**
 * Normalizes header string to find matching column regardless of casing or extra spaces.
 */
function findCol(headers, patterns) {
  for (const p of patterns) {
    const found = headers.find((h) => {
      const clean = h.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const target = p.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return clean === target || clean.includes(target);
    });
    if (found) return found;
  }
  return null;
}

/**
 * Parses raw cell value to a safe integer (defaults to 0 for empty/blank/null).
 */
function safeNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  const cleaned = String(val).replace(/,/g, '').trim();
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Normalizes district names from Nominatim or CSV for clean comparison.
 */
export function normalizeDistrictName(raw) {
  if (!raw) return '';
  return String(raw)
    .toUpperCase()
    .replace(/DISTRICT|COUNTY|COMMISSIONERATE/gi, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Parses the CSV and returns structured district crime statistics.
 */
export function parseDistrictCrimeCsv(csvString = rawCsv) {
  return new Promise((resolve, reject) => {
    if (!csvString || !csvString.trim()) {
      reject(new Error('CSV file is empty or unavailable.'));
      return;
    }

    Papa.parse(csvString, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data;
          if (!rows || rows.length === 0) {
            resolve({ districts: {}, hasPopulationData: false });
            return;
          }

          const headers = results.meta.fields || Object.keys(rows[0]);

          // Locate columns dynamically
          const stateCol = findCol(headers, ['STATE/UT', 'STATE', 'STATE_UT']);
          const districtCol = findCol(headers, ['DISTRICT', 'DISTRICT_NAME']);
          const yearCol = findCol(headers, ['YEAR']);
          const popCol = findCol(headers, ['POPULATION', 'POP']);

          const rapeCol = findCol(headers, ['RAPE', 'TOTAL RAPE']);
          const custodialRapeCol = findCol(headers, ['CUSTODIAL RAPE']);
          const otherRapeCol = findCol(headers, ['OTHER RAPE']);
          const kidnapWomenCol = findCol(headers, [
            'KIDNAPPING AND ABDUCTION OF WOMEN AND GIRLS',
            'KIDNAPPING AND ABDUCTION OF WOMEN',
            'KIDNAPPING & ABDUCTION',
          ]);
          const dowryCol = findCol(headers, ['DOWRY DEATHS', 'DOWRY']);
          const assaultCol = findCol(headers, [
            'ASSAULT ON WOMEN WITH INTENT TO OUTRAGE HER MODESTY',
            'ASSAULT ON WOMEN',
            'OUTRAGE MODESTY',
          ]);
          const insultCol = findCol(headers, [
            'INSULT TO MODESTY OF WOMEN',
            'INSULT TO MODESTY',
          ]);
          const crueltyCol = findCol(headers, [
            'CRUELTY BY HUSBAND OR HIS RELATIVES',
            'CRUELTY BY HUSBAND',
            'SECTION 498A',
          ]);
          const importGirlsCol = findCol(headers, [
            'IMPORTATION OF GIRLS FROM FOREIGN COUNTRIES',
            'IMPORTATION OF GIRLS',
          ]);

          const districtsMap = {};

          for (const row of rows) {
            const rawDistrict = row[districtCol];
            if (!rawDistrict) continue;
            const normDistrict = normalizeDistrictName(rawDistrict);
            const year = safeNum(row[yearCol]);
            if (!year) continue;

            const rape = safeNum(row[rapeCol]) || (safeNum(row[custodialRapeCol]) + safeNum(row[otherRapeCol]));
            const kidnap = safeNum(row[kidnapWomenCol]);
            const dowry = safeNum(row[dowryCol]);
            const assault = safeNum(row[assaultCol]);
            const insult = safeNum(row[insultCol]);
            const cruelty = safeNum(row[crueltyCol]);
            const importation = safeNum(row[importGirlsCol]);

            const totalWomenCrimes = rape + kidnap + dowry + assault + insult + cruelty + importation;

            if (!districtsMap[normDistrict]) {
              districtsMap[normDistrict] = {
                rawName: rawDistrict.trim(),
                state: row[stateCol] || 'UTTAR PRADESH',
                recordsByYear: {},
              };
            }

            districtsMap[normDistrict].recordsByYear[year] = {
              year,
              totalWomenCrimes,
              breakdown: {
                'Cruelty by Husband / Relatives': cruelty,
                'Kidnapping & Abduction of Women': kidnap,
                'Assault on Modesty / Molestation': assault,
                'Rape': rape,
                'Dowry Deaths': dowry,
                'Insult to Modesty': insult,
                'Importation of Girls': importation,
              },
            };
          }

          resolve({
            districts: districtsMap,
            hasPopulationData: Boolean(popCol),
          });
        } catch (err) {
          reject(err);
        }
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}

/**
 * Finds statistics for a given district name from parsed data.
 */
export function getDistrictStats(parsedData, targetDistrict) {
  if (!parsedData || !parsedData.districts || !targetDistrict) return null;

  const normTarget = normalizeDistrictName(targetDistrict);
  const districtKeys = Object.keys(parsedData.districts);

  // Exact match or contains match
  let matchedKey = districtKeys.find((k) => k === normTarget);
  if (!matchedKey) {
    matchedKey = districtKeys.find(
      (k) => k.includes(normTarget) || normTarget.includes(k)
    );
  }

  // Handle common Kanpur aliases
  if (!matchedKey && normTarget.includes('KANPUR')) {
    if (normTarget.includes('DEHAT') || normTarget.includes('RURAL')) {
      matchedKey = 'KANPUR DEHAT';
    } else {
      matchedKey = 'KANPUR NAGAR';
    }
  }

  if (!matchedKey || !parsedData.districts[matchedKey]) {
    return null;
  }

  const districtObj = parsedData.districts[matchedKey];
  const years = Object.keys(districtObj.recordsByYear)
    .map(Number)
    .sort((a, b) => a - b);

  if (years.length === 0) return null;

  const latestYear = years[years.length - 1];
  const latestRecord = districtObj.recordsByYear[latestYear];

  // Trend data across years
  const trend = years.map((yr) => ({
    year: yr,
    total: districtObj.recordsByYear[yr].totalWomenCrimes,
  }));

  return {
    districtName: districtObj.rawName || matchedKey,
    state: districtObj.state,
    latestYear,
    totalReported: latestRecord.totalWomenCrimes,
    breakdown: latestRecord.breakdown,
    trend,
    hasPopulationData: parsedData.hasPopulationData,
  };
}
