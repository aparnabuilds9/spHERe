/**
 * src/utils/exifParser.js
 *
 * Lightweight, zero-dependency client-side EXIF parser for JPEG and WebP images.
 * Operates purely on ArrayBuffer in the browser without sending images anywhere.
 * Extracts:
 * - GPS Latitude, Longitude (converted to decimal degrees)
 * - GPS Altitude & Timestamp
 * - Camera Make & Model
 * - Capture Date & Time (DateTimeOriginal)
 * - Software & OS details
 * - User comments & IPTC descriptions
 */

export function parseExifFromBuffer(arrayBuffer) {
  try {
    const dataView = new DataView(arrayBuffer);

    // Check for JPEG (SOI 0xFFD8)
    if (dataView.getUint16(0) === 0xffd8) {
      return parseJpegExif(dataView);
    }

    // Check for WebP (RIFF .... WEBP)
    if (
      dataView.getUint32(0, false) === 0x52494646 && // 'RIFF'
      dataView.getUint32(8, false) === 0x57454250    // 'WEBP'
    ) {
      return parseWebpExif(dataView);
    }

    // Plain PNG or other formats without standard TIFF EXIF APP1
    return {
      hasExif: false,
      reason: 'Standard EXIF header not present (PNG/WebP without Exif chunk, or metadata stripped)',
      metadata: {},
    };
  } catch (err) {
    return {
      hasExif: false,
      reason: `Error reading file header: ${err.message}`,
      metadata: {},
    };
  }
}

function parseJpegExif(view) {
  let offset = 2;
  const length = view.byteLength;

  while (offset < length - 2) {
    const marker = view.getUint16(offset);
    offset += 2;

    // APP1 marker 0xFFE1 (EXIF)
    if (marker === 0xffe1) {
      const app1Length = view.getUint16(offset);
      offset += 2;

      // Check for 'Exif\0\0' (0x45786966 0x0000)
      if (
        view.getUint32(offset) === 0x45786966 &&
        view.getUint16(offset + 4) === 0x0000
      ) {
        const tiffOffset = offset + 6;
        return parseTiffHeader(view, tiffOffset);
      }
      offset += app1Length - 2;
    } else if ((marker & 0xff00) === 0xff00 && marker !== 0xffd8 && marker !== 0xffd9) {
      // Other JPEG segment, skip payload
      const segmentLength = view.getUint16(offset);
      offset += segmentLength;
    } else {
      break;
    }
  }

  return {
    hasExif: false,
    reason: 'No EXIF APP1 segment found in JPEG file',
    metadata: {},
  };
}

function parseWebpExif(view) {
  let offset = 12;
  const length = view.byteLength;

  while (offset < length - 8) {
    const fourCC = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);
    offset += 8;

    if (fourCC === 'EXIF') {
      let tiffOffset = offset;
      if (
        view.getUint32(tiffOffset) === 0x45786966 &&
        view.getUint16(tiffOffset + 4) === 0x0000
      ) {
        tiffOffset += 6;
      }
      return parseTiffHeader(view, tiffOffset);
    }

    // Chunks are padded to even size
    offset += chunkSize + (chunkSize % 2);
  }

  return {
    hasExif: false,
    reason: 'No EXIF chunk found in WebP container',
    metadata: {},
  };
}

function parseTiffHeader(view, tiffOffset) {
  const byteOrder = view.getUint16(tiffOffset);
  let littleEndian;

  if (byteOrder === 0x4949) {
    littleEndian = true; // Intel 'II'
  } else if (byteOrder === 0x4d4d) {
    littleEndian = false; // Motorola 'MM'
  } else {
    return {
      hasExif: false,
      reason: 'Invalid TIFF byte order',
      metadata: {},
    };
  }

  // Verify TIFF fixed 42
  if (view.getUint16(tiffOffset + 2, littleEndian) !== 42) {
    return {
      hasExif: false,
      reason: 'Invalid TIFF identifier',
      metadata: {},
    };
  }

  const ifd0Offset = view.getUint32(tiffOffset + 4, littleEndian);
  const metadata = {};
  let gpsOffset = null;
  let exifSubIfdOffset = null;

  // Read IFD0
  readIFD(view, tiffOffset, tiffOffset + ifd0Offset, littleEndian, (tag, val) => {
    switch (tag) {
      case 0x010f: metadata.make = val; break;
      case 0x0110: metadata.model = val; break;
      case 0x0131: metadata.software = val; break;
      case 0x0132: metadata.dateTime = val; break;
      case 0x010e: metadata.imageDescription = val; break;
      case 0x8769: exifSubIfdOffset = val; break;
      case 0x8825: gpsOffset = val; break;
      default: break;
    }
  });

  // Read Exif SubIFD
  if (exifSubIfdOffset) {
    readIFD(view, tiffOffset, tiffOffset + exifSubIfdOffset, littleEndian, (tag, val) => {
      switch (tag) {
        case 0x9003: metadata.dateTimeOriginal = val; break;
        case 0x9004: metadata.dateTimeDigitized = val; break;
        case 0x9286: metadata.userComment = val; break;
        case 0xa434: metadata.lensModel = val; break;
        default: break;
      }
    });
  }

  // Read GPS IFD
  const gpsData = {};
  if (gpsOffset) {
    readIFD(view, tiffOffset, tiffOffset + gpsOffset, littleEndian, (tag, val) => {
      switch (tag) {
        case 0x0001: gpsData.latRef = val; break; // 'N' or 'S'
        case 0x0002: gpsData.latitude = val; break; // [deg, min, sec]
        case 0x0003: gpsData.lonRef = val; break; // 'E' or 'W'
        case 0x0004: gpsData.longitude = val; break; // [deg, min, sec]
        case 0x0005: gpsData.altRef = val; break;
        case 0x0006: gpsData.altitude = val; break;
        case 0x0007: gpsData.timestamp = val; break;
        default: break;
      }
    });

    if (gpsData.latitude && gpsData.longitude) {
      const lat = convertDmsToDecimal(gpsData.latitude, gpsData.latRef);
      const lon = convertDmsToDecimal(gpsData.longitude, gpsData.lonRef);
      if (lat !== null && lon !== null) {
        metadata.gps = {
          latitude: lat,
          longitude: lon,
          latRef: gpsData.latRef,
          lonRef: gpsData.lonRef,
          altitude: typeof gpsData.altitude === 'number' ? gpsData.altitude : null,
          googleMapsUrl: `https://www.google.com/maps?q=${lat},${lon}`,
        };
      }
    }
  }

  const hasAnyData = Object.keys(metadata).length > 0;
  return {
    hasExif: hasAnyData,
    metadata,
    reason: hasAnyData ? 'EXIF metadata present' : 'EXIF segment present but no critical tags populated',
  };
}

function readIFD(view, tiffOffset, dirOffset, littleEndian, callback) {
  if (dirOffset + 2 > view.byteLength) return;
  const numEntries = view.getUint16(dirOffset, littleEndian);
  let entryOffset = dirOffset + 2;

  for (let i = 0; i < numEntries; i++) {
    if (entryOffset + 12 > view.byteLength) break;
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffset = entryOffset + 8;

    const val = readTagValue(view, tiffOffset, valueOffset, type, count, littleEndian);
    if (val !== undefined && val !== null) {
      callback(tag, val);
    }
    entryOffset += 12;
  }
}

function readTagValue(view, tiffOffset, valueOffset, type, count, littleEndian) {
  // Types: 1=BYTE, 2=ASCII, 3=SHORT, 4=LONG, 5=RATIONAL, 7=UNDEFINED, 10=SRATIONAL
  try {
    if (type === 2) {
      // ASCII string
      let offset = count > 4 ? tiffOffset + view.getUint32(valueOffset, littleEndian) : valueOffset;
      if (offset + count > view.byteLength) return null;
      let str = '';
      for (let i = 0; i < count - 1; i++) {
        const c = view.getUint8(offset + i);
        if (c === 0) break;
        str += String.fromCharCode(c);
      }
      return str.trim();
    }

    if (type === 3) {
      // SHORT (16-bit)
      if (count === 1) return view.getUint16(valueOffset, littleEndian);
      const offset = tiffOffset + view.getUint32(valueOffset, littleEndian);
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push(view.getUint16(offset + i * 2, littleEndian));
      }
      return arr;
    }

    if (type === 4) {
      // LONG (32-bit)
      if (count === 1) return view.getUint32(valueOffset, littleEndian);
      const offset = tiffOffset + view.getUint32(valueOffset, littleEndian);
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push(view.getUint32(offset + i * 4, littleEndian));
      }
      return arr;
    }

    if (type === 5 || type === 10) {
      // RATIONAL (numerator / denominator)
      const offset = tiffOffset + view.getUint32(valueOffset, littleEndian);
      if (offset + count * 8 > view.byteLength) return null;
      const arr = [];
      for (let i = 0; i < count; i++) {
        const num = type === 10
          ? view.getInt32(offset + i * 8, littleEndian)
          : view.getUint32(offset + i * 8, littleEndian);
        const den = type === 10
          ? view.getInt32(offset + i * 8 + 4, littleEndian)
          : view.getUint32(offset + i * 8 + 4, littleEndian);
        arr.push(den === 0 ? 0 : num / den);
      }
      return count === 1 ? arr[0] : arr;
    }

    if (type === 7) {
      // UNDEFINED (UserComment etc.)
      const offset = count > 4 ? tiffOffset + view.getUint32(valueOffset, littleEndian) : valueOffset;
      if (offset + count > view.byteLength) return null;
      let str = '';
      for (let i = 0; i < Math.min(count, 128); i++) {
        const code = view.getUint8(offset + i);
        if (code >= 32 && code <= 126) str += String.fromCharCode(code);
      }
      return str.trim();
    }
  } catch {
    return null;
  }
  return null;
}

function convertDmsToDecimal(dmsArray, ref) {
  if (!Array.isArray(dmsArray) || dmsArray.length < 3) return null;
  const [deg, min, sec] = dmsArray;
  let dec = deg + min / 60 + sec / 3600;
  if (ref === 'S' || ref === 'W') {
    dec = -dec;
  }
  return Number(dec.toFixed(6));
}
