/* eslint-disable no-console */

const EPub = require('epub');
const fs = require('fs');
const {parseString} = require('xml2js');

const filepath = process.argv[2];
const epub = new EPub(filepath);

const LAST_PAGE = 388;
const NUM_CHAPTERS = 10;

const map = {};

function processPage(page) {
  if (page.search(/\d/) !== 0) {
    return;
  }

  // Get the page number from the beginning of the string.
  const [pageNumber, ...content] = page.split('"/>');

  // Map the content to the page number and strip out html tags.
  map[pageNumber] = content.join(''); //.replace(/<(?:.|\n)*?>/gm, '');

  // HACK. `getChapter` is async, so write the file when we reach the
  // last page
  if (+pageNumber === LAST_PAGE) {
    fs.writeFile('./data/pageMap.json', JSON.stringify(map, null, 2), (err) => {
      console.log('Done.');
    });
  }
}

epub.on('error', (err) => {
  throw err;
});

epub.on('end', (err) => {
  if (err) {
    return console.log(err);
  }

  // Go through each chapter and stitch the content together.
  for (let ii = 1; ii <= NUM_CHAPTERS; ii++) {
    const chapterId = ii < 10 ? `ch0${ii}` : `ch${ii}`;

    epub.getChapter(chapterId, (err, data) => {
      const pages = data.split('id="page_');
      pages.forEach(processPage);
    });
  }
});

epub.parse();
