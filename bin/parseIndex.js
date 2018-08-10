const EPub = require('epub');
const fs = require('fs');
const sortBy = require('lodash.sortby');
const uniq = require('lodash.uniq');
const {parseString} = require('xml2js');

const filepath = process.argv[2];
const epub = new EPub(filepath);

const BOOK_LENGTH = 444; // 444 pages.

// Looks at an entry and splits it into the main value string and the string
// containing the associated pages.
function parseEntry(entry) {
  const val = entry['_'];
  const pagesStartIndex = val.search(/\d/);

  // The entry isn't directly referenced on any pages, so skip it.
  if (pagesStartIndex === -1) {
    return {};
  }

  let value = val.substr(0, pagesStartIndex).trim();

  // Remove the last/trailing comma. If the artist has a nickname,
  // eg: "Baker, Harold “Shorty,”", the comma isn't actually the last
  // character, so we need to slice it and re-concatenate the string.
  const lastCommaIndex = value.lastIndexOf(',');
  value = value.slice(0, lastCommaIndex) + value.slice(lastCommaIndex + 1);

  return {
    // Break out the pages on which the entry is referenced.
    refs: val.substr(pagesStartIndex).split(', '),
    value,
  };
}

function parseName(value) {
  let [last, name, suffix] = value.split(', ');
  let [first, nickname] = name.split(' “');

  if (nickname) {
    nickname = nickname.replace('”', '');
  }

  return {
    first,
    last,
    nickname,
    suffix,
  };
}

function getPageAndNoteReferences(refs, pages, notes) {
  // Iterate over the list of pages and normalize to account for ranges
  // and footnote references.
  for (let ii = 0; ii < refs.length; ii++) {
    const ref = refs[ii];

    // Denotes a range of pages. Expand to a set of individual pages.
    if (ref.indexOf('–') > -1) {
      let [min, max] = ref.split('–');

      // Normalize the number for the upper bound. The ranges are written
      // as, eg: "346-48" or "207-9", so the max needs to be converted to
      // "348" or "209", respectively.
      if (+max < +min) {
        // Get the extra digits from the min number and prepend it to the
        // max. We're concatenating strings here, not adding numbers.
        max = min.slice(0, -max.length) + max;
      }

      // Add each page in the range.
      for (let jj = +min; jj <= +max; jj++) {
        pages.push(+jj);
      }
      continue;
    }

    // There are 444 pages in the book, so any number longer than that is
    // referencing a footnote.
    if (parseInt(ref.replace('n', ''), 10) > BOOK_LENGTH) {
      notes.push(ref);
      continue;
    }

    pages.push(parseInt(ref, 10));
  }
}

function parseIndex(err, data) {
  if (err) {
    return console.log(err);
  }

  parseString(data, (err, result) => {
    if (err) {
      return console.log(err);
    }

    const content = [];
    const entries = result.html.body[0]['p'];

    entries.forEach((entry, idx) => {
      if (entry['$'].class === 'indexsub') {
        return;
      }

      const {refs, value} = parseEntry(entry);

      if (!refs || !value) {
        return;
      }

      // Names generally have the form "Lastname, Firstname" (with one comma).
      // Anything less than that isn't referring to a person. There are a few
      // instances with more than one, eg: "Connick, Harry, Jr."
      if (value.split(',').length - 1 < 1) {
        return;
      }

      // Values that begin in quotes are song titles, not people.
      if (value.indexOf('“') === 0) {
        return;
      }

      const name = parseName(value);

      // Filter out venues.
      if (name.first.toLowerCase() === 'the') {
        return;
      }

      // Filter out one-off.
      if (value.indexOf('Africanization') > -1) {
        return;
      }

      const pages = [];
      const notes = [];

      getPageAndNoteReferences(refs, pages, notes);

      // Anyone with fewer than 2 page refrerences isn't prominent enough.
      if (pages.length < 2) {
        return;
      }

      // Look ahead to the next entry to see if it's a subindex related to the
      // current main entry. If it is, parse those pages and add to the entry.
      let kk = idx + 1;
      while (entries[kk] && entries[kk]['$'].class === 'indexsub') {
        getPageAndNoteReferences(parseEntry(entries[kk]).refs, pages, notes);
        kk++;
      }

      content.push({
        name,
        notes: sortBy(uniq(notes)),
        pages: sortBy(uniq(pages)),
        value,
      });
    });

    fs.writeFile('index.json', JSON.stringify(content, null, 2), (err) => {
      if (err) {
        return console.log(err);
      }
      console.log('Done.');
    });
  });
}

epub.on('error', (err) => {
  throw err;
});

epub.on('end', (err) => {
  if (err) {
    return console.log(err);
  }

  // Retrieve and parse the index
  epub.getChapterRaw('index', parseIndex);
});

epub.parse();
