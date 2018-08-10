const fs = require('fs');
const sortBy = require('lodash.sortby');

const index = require('../data/index');
const pageMap = require('../data/pageMap');

function getRefCount(str, match) {
  return (str.match(new RegExp(match, 'g')) || []).length;
}

/**
 * Using the index, search those pages for references to a given artist.
 *
 * A reference is an instance where the artist is mentioned in the book. This
 * might be a mention of the artist's first, last, full, or nickname. Using
 * references rather than simple pages from the index provides more
 * granularity in determining relative influence.
 *
 * NOTE: The search algorithm is currently inexact and may result in both false
 * positives and negatives. It should still provide a good indication of
 * influence.
 */
function getReferences() {
  const data = index.map((artist) => {
    const refs = artist.pages.reduce((acc, page) => {
      const {first, last, nickname} = artist.name;
      const str = pageMap[page];

      let firstNameRefs;
      let nameRefs;

      if (nickname) {
        firstNameRefs = getRefCount(str, nickname);
        nameRefs = getRefCount(str, `${nickname} ${last}`);
      } else {
        firstNameRefs = getRefCount(str, first);
        nameRefs = getRefCount(str, `${first} ${last}`);
      }

      const lastNameRefs = getRefCount(str, last);

      return acc + firstNameRefs + lastNameRefs - nameRefs;
    }, 0);

    return {
      ...artist,
      references: refs + artist.notes.length,
    };
  });

  // Overwrite existing index.json file.
  fs.writeFile('./data/data.json', JSON.stringify(data, null, 2), (err) => {
    console.log('Done.');
  });
}

getReferences();
