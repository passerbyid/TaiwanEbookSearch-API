import timeoutSignal from 'timeout-signal';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import cheerio, { CheerioAPI } from 'cheerio';

import { Book } from '../interfaces/book';
import { getProcessTime } from '../interfaces/general';
import { FirestoreBookstore } from '../interfaces/firestoreBookstore';

const title = 'booksCompany' as const;

export default ({ proxyUrl, ...bookstore }: FirestoreBookstore, keywords = '') => {
  // start calc process time
  const hrStart = process.hrtime();

  if (!bookstore.isOnline) {
    const hrEnd = process.hrtime(hrStart);
    const processTime = getProcessTime(hrEnd);
    const result = {
      bookstore,
      status: 'Bookstore is offline',
      quantity: 0,
      title,
      isOkay: false,
      processTime,
      books: [],
      error: {
        message: 'Bookstore is not open.',
        type: 'bookstore-invalid',
      }
    };

    return result;
  }

  // URL encode
  keywords = encodeURIComponent(keywords);
  const base = `https://search.books.com.tw/search/query/key/${keywords}/cat/EBA`;

  const options = {
    method: 'GET',
    compress: true,
    signal: timeoutSignal(10000),
    agent: proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined,
    headers: {
      'User-Agent': 'Taiwan-Ebook-Search/0.1',
    },
  };

  return fetch(base, options)
    .then(response => {
      if (!response.ok) {
        throw response.statusText;
      }

      return response.text();
    })
    .then(body => {
      return _getBooks(cheerio.load(body));
    })

    .then(books => {
      // calc process time
      const hrEnd = process.hrtime(hrStart);
      const processTime = getProcessTime(hrEnd);

      return {
        bookstore,
        status: 'Crawler success.',
        quantity: books.length,
        title,
        isOkay: true,
        processTime,
        books,
      };
    })
    .catch(error => {
      // calc process time
      const hrEnd = process.hrtime(hrStart);
      const processTime = getProcessTime(hrEnd);

      console.log(error.message);

      return {
        bookstore,
        status: 'Crawler failed.',
        quantity: 0,
        title,
        isOkay: false,
        processTime,
        books: [],
        error,
      };
    });
};

function _getBooks($: CheerioAPI) {
  const $list = $('#itemlist_table > tbody');

  let books: Book[] = [];

  if (!$list.length) {
    // console.log('Not found in books company!');

    return books;
  }

  $list.each((i, elem) => {
    // Combine authors to array
    let authors: string[] = [];

    $('a[rel=go_author]', elem).each((i, e) => {
      authors = authors.concat($(e).prop('title').split('、'));
    });

    const id = $('input[name=prod_check]', elem).prop('value');

    const price = parseFloat(
      $('.list-nav', elem)
        .children('li')
        .children('strong')
        .last()
        .text()
        .replace(/NT\$|,/g, '')
    );

    books[i] = {
      id,
      thumbnail: $('a[rel=mid_image]', elem).children('img').data('src') as string,
      title: $('a[rel=mid_name]', elem).prop('title'),
      link: `https://www.books.com.tw/products/${id}`,
      priceCurrency: 'TWD',
      price: price >= 0 ? price : -1,
      about: $('.txt_cont', elem)
        .children('p')
        .text()
        .replace(/...... more\n\t\t\t\t\t\t\t\t/g, ' ...'),
      publisher: $('a[rel=mid_publish]', elem).prop('title'),
    };

    if (authors.length > 0) {
      books[i].authors = authors;
    }
  });

  return books;
}
