import axios from 'axios';
import cheerio from 'cheerio';
import { DateTime } from 'luxon';

export const getDataByDate = async (date: DateTime) => {
  const url = `https://apod.nasa.gov/apod/ap${date.toFormat('yyMMdd')}.html`;
  console.log(`fetching ${url}`);
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  const buf = Buffer.from(response.data);
  // Some APOD pages are served as UTF-16 LE despite the Content-Type header claiming UTF-8
  const html = buf[0] === 0xFF && buf[1] === 0xFE
    ? buf.toString('utf16le')
    : buf.toString('utf8');

  console.log(`parsing ${url}`);
  const $ = cheerio.load(html);

  const body = $('body').text();
  const title =
    // APOD's official API tries to find the title based on the html structure
    // https://github.com/nasa/apod-api/blob/e69d56d223543f84fb88ed6be292b48a7064297c/apod/utility.py#L125-L162
    $('center').length < 2
      ? $('title').text().split(' - ')[1].trim()
      : $('b').first().text().split('\n')[0].trim();

  const imageElement = $(
    'a[href^=image] img[src^=image], button img[src^=image]'
  );
  const iframeElement = $('iframe');
  const videoTagElement = $('video');
  const videoSourceElement = $('video source');
  // these seem to be video embeds as well
  const embedElement = $('embed');
  const descriptionHtml = $('center ~ center ~ p')
    .html()
    ?.replace('Explanation:', '')
    .trim() ?? '';

  // we want to extract anything between 'copyright' and 'explanation
  const [, copyright] =
    /copyright:\s+(.+)\s+explanation/gi.exec(body.replace(/\s+/gi, ' ')) || [];
  // we want to extract anything between 'credit' and 'explanation
  const [, credit] =
    /credit:\s+(.+?)\s+(?:;|explanation)/gi.exec(body.replace(/\s+/gi, ' ')) ||
    [];

  const normalizeApodUrl = (rawUrl?: string) => {
    if (!rawUrl) return undefined;
    if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
    if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
    return `https://apod.nasa.gov/apod/${rawUrl.replace(/^\/+/, '')}`;
  };

  const imageUrl = normalizeApodUrl(imageElement.attr('src'));
  const hdImageUrl = normalizeApodUrl($('a[href^=image]').attr('href'));
  const iframeUrl = normalizeApodUrl(iframeElement.attr('src'));
  const videoUrl = normalizeApodUrl(
    videoSourceElement.attr('src') ||
      videoTagElement.attr('src') ||
      embedElement.attr('src')
  );

  return {
    title,
    credit,
    explanation: descriptionHtml,
    date: date.toISODate(),
    hdurl: hdImageUrl ?? imageUrl,
    service_version: 'v1',
    copyright,
    media_type: imageUrl ? 'image' : iframeUrl || videoUrl ? 'video' : 'other',
    url: imageUrl ?? videoUrl ?? iframeUrl,
  };
};
