// Bundled by tools/preview/standalone.mjs into the offline demo's vendor folder.
// dayjs + the four plugins the app registers, in one ESM file.
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import customParse from 'dayjs/plugin/customParseFormat.js';
dayjs.extend(utc); dayjs.extend(timezone); dayjs.extend(relativeTime); dayjs.extend(customParse);
export default dayjs;
export { utc, timezone, relativeTime, customParse };
