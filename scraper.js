const fs = require('fs').promises;
const cheerio = require('cheerio');

const URL = 'https://rockforpeople.cz/harmonogram/';
const HTML_FILE = 'temp_harmonogram.html';
const JSON_FILE = 'harmonogram.json';

const IGNORE_BANDS = ['Special Guest by Mastercard', 'Planetrox 2026', 'Karaoke'];

const STAGE_MAPPING = {
  'Mastercard Stage': 'Mastercard',
  'Rock for People Stage': 'RFP',
  'E2 Stage': 'E2',
  'Petr Svoboda Stage': 'Petr Svoboda',
  'ČT art Stage': 'CT Art',
  'Reflex Stage': 'Reflex',
  'EcoFlow Stage': 'EcoFlow',
  'Karaoke Stage': 'Karaoke'
};

async function downloadHTML() {
  console.log(`Fetching ${URL}...`);
  try {
    const response = await fetch(URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    const html = await response.text();
    await fs.writeFile(HTML_FILE, html);
    console.log(`HTML saved to ${HTML_FILE}`);
    return html;
  } catch (error) {
    console.error('Error downloading HTML:', error);
    process.exit(1);
  }
}

async function scrape() {
  let html;
  try {
    html = await fs.readFile(HTML_FILE, 'utf8');
  } catch (e) {
    html = await downloadHTML();
  }

  const $ = cheerio.load(html);
  const scrapedBands = [];

  // Get stage name mapping from buttons
  const stageIdToName = {};
  $('.timetable__stage-button').each((_, el) => {
    const stageId = $(el).attr('data-stage');
    const fullName = $(el).text().trim();
    if (stageId !== 'all') {
      stageIdToName[stageId] = STAGE_MAPPING[fullName] || fullName;
    }
  });

  $('.timetable__day').each((_, dayEl) => {
    const dataDay = $(dayEl).attr('data-day'); // e.g. "streda-10-6"
    const dayMatch = dataDay.match(/-(\d+)-/);
    if (!dayMatch) return;
    const dayNum = parseInt(dayMatch[1]) - 9; // 10 -> 1, 11 -> 2, etc.

    $(dayEl).find('.timetable__stagetime').each((_, stageEl) => {
      const stageId = $(stageEl).attr('data-stage');
      const stageName = stageIdToName[stageId];

      $(stageEl).find('.timetable__entry').each((_, entryEl) => {
        const bandName = $(entryEl).find('.name').text().trim();
        if (IGNORE_BANDS.includes(bandName)) return;

        const startTime = $(entryEl).attr('data-start-time');
        const endTime = $(entryEl).attr('data-end-time');

        scrapedBands.push({
          day: dayNum,
          bandName,
          startTime,
          endTime,
          stage: stageName
        });
      });
    });
  });

  console.log(`Scraped ${scrapedBands.length} bands.`);
  await updateHarmonogram(scrapedBands);
}

function getTimeValue(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  let totalMinutes = hours * 60 + minutes;
  if (hours < 6) {
    totalMinutes += 24 * 60;
  }
  return totalMinutes;
}

async function updateHarmonogram(scrapedBands) {
  let existingHarmonogram = [];
  try {
    const data = await fs.readFile(JSON_FILE, 'utf8');
    existingHarmonogram = JSON.parse(data);
  } catch (e) {
    console.log('No existing harmonogram.json found or invalid JSON.');
  }

  const newHarmonogram = [];
  let maxId = existingHarmonogram.reduce((max, band) => Math.max(max, parseInt(band.bandId) || 0), 0);

  const existingBandsMap = new Map();
  existingHarmonogram.forEach(band => {
    existingBandsMap.set(band.bandName, band);
  });

  const scrapedBandNames = new Set();

  scrapedBands.forEach(scraped => {
    const existing = existingBandsMap.get(scraped.bandName);
    let bandId;
    if (existing) {
      bandId = existing.bandId;
    } else {
      maxId++;
      bandId = maxId.toString();
    }

    newHarmonogram.push({
      ...scraped,
      bandId
    });
    scrapedBandNames.add(scraped.bandName);
  });

  // Add inactive bands that were in existing harmonogram but not in scraped data
  existingHarmonogram.forEach(existing => {
    if (!scrapedBandNames.has(existing.bandName)) {
      newHarmonogram.push({
        ...existing,
        active: false
      });
    }
  });

  // Sort by day and startTime (treating 0:00-6:00 as late night)
  newHarmonogram.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    return getTimeValue(a.startTime) - getTimeValue(b.startTime);
  });

  await fs.writeFile(JSON_FILE, JSON.stringify(newHarmonogram, null, 2));
  console.log(`Updated ${JSON_FILE} with ${newHarmonogram.length} entries.`);
}

scrape();
