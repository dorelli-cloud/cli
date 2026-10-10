// GEGENEREERD uit lib/beeld-metadata.ts door scripts/cli-beeld-metadata.mjs.
// Niet met de hand bewerken: wijzig de bron en draai het script opnieuw.
// scripts/cli-test faalt als dit bestand achterloopt.
const GPS_IFD = 0x8825;
const EXIF_IFD = 0x8769;
const GPS_BREEDTE = 0x0002;
const GPS_LENGTE = 0x0004;
const PLAFOND = 100_000;
const MAX_CONTAINERS = 4096;
const XMP_MAX = 16 * 1024 * 1024;
const TIJD_MS = 3000;
const PUBLICATIE_MS = 20_000;
const TYPE_BYTES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };
class Weigering extends Error {
}
let deadline = 0;
let vasteDeadline = 0;
const zetDeadline = () => {
    deadline = vasteDeadline || Date.now() + TIJD_MS;
};
const opTijd = () => {
    if (Date.now() > deadline)
        throw new Weigering();
};
const latin1 = (b, van, tot) => Buffer.from(b.subarray(Math.max(0, van), Math.min(tot, b.length))).toString("latin1");
const u16be = (b, o) => (b[o] << 8) | b[o + 1];
const u32be = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const u32le = (b, o) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + b[o + 3] * 0x1000000;
const alsBuffer = (b) => Buffer.from(b.buffer, b.byteOffset, b.byteLength);
function raakt(lijst) {
    const s = [...lijst].sort((a, z) => a[0] - z[0]);
    const verst = new Float64Array(s.length);
    let m = -Infinity;
    for (let i = 0; i < s.length; i++)
        verst[i] = m = Math.max(m, s[i][1]);
    return ([van, tot]) => {
        let lo = 0;
        let hi = s.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (s[mid][0] < tot)
                lo = mid + 1;
            else
                hi = mid;
        }
        return lo > 0 && verst[lo - 1] > van;
    };
}
function voegToe(lijst, c) {
    if (lijst.length >= MAX_CONTAINERS)
        throw new Weigering();
    lijst.push(c);
}
function volgendeMarker(b, o) {
    for (let p = o; p + 1 < b.length; p++) {
        if ((p & 0xfffff) === 0)
            opTijd();
        if (b[p] !== 0xff)
            continue;
        const m = b[p + 1];
        if (m !== 0x00 && m !== 0xff && !(m >= 0xd0 && m <= 0xd7))
            return p;
    }
    return -1;
}
function jpegLezen(b) {
    const containers = [];
    let o = 0;
    let beelden = 0;
    let laatsteEoi = -1;
    while (o + 4 <= b.length && b[o] === 0xff && b[o + 1] === 0xd8) {
        if (++beelden > 64)
            throw new Weigering();
        o += 2;
        let segmenten = 0;
        let eindeBeeld = -1;
        while (o + 2 <= b.length) {
            if (++segmenten > PLAFOND)
                throw new Weigering();
            if (b[o] !== 0xff || b[o + 1] === 0x00) {
                o = volgendeMarker(b, o);
                if (o < 0)
                    break;
                continue;
            }
            if (b[o + 1] === 0xff) {
                o++;
                continue;
            }
            const marker = b[o + 1];
            if (marker === 0xd9) {
                eindeBeeld = o + 2;
                break;
            }
            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
                o += 2;
                continue;
            }
            if (o + 4 > b.length)
                break;
            const lengte = u16be(b, o + 2);
            if (lengte < 2)
                throw new Weigering();
            if (o + 2 + lengte > b.length)
                break;
            const inhoud = o + 4;
            const eind = o + 2 + lengte;
            if (marker === 0xe1) {
                const kop = latin1(b, inhoud, Math.min(eind, inhoud + 80));
                if (kop.startsWith("Exif\0\0"))
                    voegToe(containers, { soort: "tiff", van: inhoud + 6, tot: eind });
                else if (kop.startsWith("http://ns.adobe.com/xap/1.0/\0"))
                    voegToe(containers, { soort: "xmp", van: inhoud + 29, tot: eind });
                else if (kop.startsWith("http://ns.adobe.com/xmp/extension/\0") && eind - inhoud >= 75)
                    voegToe(containers, { soort: "xmp-ext", van: inhoud + 75, tot: eind, guid: latin1(b, inhoud + 35, inhoud + 67), offset: u32be(b, inhoud + 71) });
            }
            if (marker === 0xed && latin1(b, inhoud, inhoud + 14) === "Photoshop 3.0\0")
                voegToe(containers, { soort: "iptc", van: inhoud + 14, tot: eind });
            o = eind;
            if (marker === 0xda) {
                o = volgendeMarker(b, o);
                if (o < 0)
                    break;
            }
        }
        if (eindeBeeld < 0)
            break;
        o = laatsteEoi = eindeBeeld;
        let p = o;
        while (p < b.length && p - o < 4096 && b[p] === 0x00)
            p++;
        if (b[p] === 0xff && b[p + 1] === 0xd8 && b[p + 2] === 0xff)
            o = p;
        else
            break;
    }
    let onvolledig = false;
    if (laatsteEoi >= 0) {
        const ftyp = alsBuffer(b).indexOf("ftyp", laatsteEoi, "latin1");
        if (ftyp >= laatsteEoi + 4) {
            try {
                for (const c of mp4Lezen(b, ftyp - 4, b.length))
                    voegToe(containers, c);
            }
            catch (e) {
                if (!(e instanceof Weigering) || Date.now() > deadline)
                    throw e;
                onvolledig = true;
            }
        }
    }
    return { containers, onvolledig };
}
function boxen(b, van, tot, streng = true) {
    const uit = [];
    let o = van;
    while (o + 8 <= tot) {
        if (uit.length > PLAFOND)
            throw new Weigering();
        let grootte = u32be(b, o);
        let kop = 8;
        if (grootte === 1) {
            if (o + 16 > tot) {
                if (streng)
                    throw new Weigering();
                break;
            }
            grootte = u32be(b, o + 8) * 0x100000000 + u32be(b, o + 12);
            kop = 16;
        }
        else if (grootte === 0)
            grootte = tot - o;
        if (grootte < kop || o + grootte > tot) {
            if (streng)
                throw new Weigering();
            break;
        }
        uit.push({ type: latin1(b, o + 4, o + 8), o, tot: o + grootte, inhoud: o + kop });
        o += grootte;
    }
    return uit;
}
function metaKinderen(b, meta) {
    const iso = latin1(b, meta.inhoud + 8, meta.inhoud + 12) === "hdlr";
    return boxen(b, meta.inhoud + (iso ? 4 : 0), meta.tot);
}
function mp4Lezen(b, start, eind) {
    const uit = [];
    const loop = (van, tot, diepte) => {
        opTijd();
        for (const x of boxen(b, van, tot, diepte > 0)) {
            if ((x.type === "©xyz" || x.type === "loci") && x.tot - x.inhoud > 4)
                uit.push({ soort: "box", van: x.o + 4, tot: x.tot, inhoud: x.inhoud });
            else if (x.type === "meta")
                uit.push(...quicktimeLocatie(b, metaKinderen(b, x)));
            else if (diepte < 8 && (x.type === "moov" || x.type === "udta" || x.type === "trak"))
                loop(x.inhoud, x.tot, diepte + 1);
        }
    };
    loop(start, eind, 0);
    return uit;
}
function quicktimeLocatie(b, kinderen) {
    const keys = kinderen.find((x) => x.type === "keys");
    const ilst = kinderen.find((x) => x.type === "ilst");
    if (!ilst)
        return [];
    const aantal = keys ? u32be(b, keys.inhoud + 4) : 0;
    if (aantal > PLAFOND)
        throw new Weigering();
    const plaatsIndex = new Set();
    let p = keys ? keys.inhoud + 8 : 0;
    for (let i = 1; keys && i <= aantal && p + 8 <= keys.tot; i++) {
        const grootte = u32be(b, p);
        if (grootte < 8 || p + grootte > keys.tot)
            throw new Weigering();
        if (/location/i.test(latin1(b, p + 8, p + grootte)))
            plaatsIndex.add(i);
        p += grootte;
    }
    const uit = [];
    for (const item of boxen(b, ilst.inhoud, ilst.tot)) {
        if (!plaatsIndex.has(u32be(b, item.o + 4)) && item.type !== "©xyz")
            continue;
        for (const data of boxen(b, item.inhoud, item.tot))
            if (data.type === "data" && data.tot - data.inhoud > 8)
                uit.push({ soort: "tekst", van: data.inhoud + 8, tot: data.tot });
    }
    return uit;
}
function heifLezen(b) {
    const containers = [];
    const meta = boxen(b, 0, b.length, false).find((x) => x.type === "meta");
    if (!meta)
        return { containers };
    const binnen = metaKinderen(b, meta);
    const soortVanItem = new Map();
    const iinf = binnen.find((x) => x.type === "iinf");
    if (iinf) {
        const v = b[iinf.inhoud];
        for (const infe of boxen(b, iinf.inhoud + 4 + (v === 0 ? 2 : 4), iinf.tot).filter((x) => x.type === "infe")) {
            const iv = b[infe.inhoud];
            if (iv < 2)
                continue;
            let p = infe.inhoud + 4;
            const id = iv === 2 ? u16be(b, p) : u32be(b, p);
            p += (iv === 2 ? 2 : 4) + 2;
            const type = latin1(b, p, p + 4);
            p += 4;
            let soort = type;
            if (type === "mime") {
                while (p < infe.tot && b[p] !== 0)
                    p++;
                soort = /rdf\+xml/i.test(latin1(b, p + 1, infe.tot).split("\0")[0]) ? "XMP" : "mime";
            }
            soortVanItem.set(id, soort);
        }
    }
    const iloc = binnen.find((x) => x.type === "iloc");
    const idat = binnen.find((x) => x.type === "idat");
    if (!iloc)
        return { containers };
    const v = b[iloc.inhoud];
    let p = iloc.inhoud + 4;
    const offsetGrootte = b[p] >> 4;
    const lengteGrootte = b[p] & 15;
    const basisGrootte = b[p + 1] >> 4;
    const indexGrootte = v === 1 || v === 2 ? b[p + 1] & 15 : 0;
    p += 2;
    const lees = (grootte) => {
        if (p + grootte > iloc.tot)
            throw new Weigering();
        let x = 0;
        for (let i = 0; i < grootte; i++)
            x = x * 256 + b[p + i];
        p += grootte;
        return x;
    };
    const aantal = v < 2 ? lees(2) : lees(4);
    if (aantal > PLAFOND)
        throw new Weigering();
    const metaItems = [];
    const beeldBereiken = [];
    const perExtent = indexGrootte + offsetGrootte + lengteGrootte;
    let totaalExtents = 0;
    for (let i = 0; i < aantal; i++) {
        opTijd();
        const id = v < 2 ? lees(2) : lees(4);
        const methode = v === 1 || v === 2 ? lees(2) & 15 : 0;
        lees(2);
        const basis = lees(basisGrootte);
        const extents = lees(2);
        totaalExtents += extents;
        if (totaalExtents > PLAFOND || (extents && !perExtent) || p + extents * perExtent > iloc.tot)
            throw new Weigering();
        const soort = soortVanItem.get(id);
        const isMeta = soort === "Exif" || soort === "XMP";
        if (isMeta && extents !== 1)
            throw new Weigering();
        for (let e = 0; e < extents; e++) {
            if (indexGrootte)
                lees(indexGrootte);
            const off = lees(offsetGrootte);
            const len = lees(lengteGrootte);
            if (methode === 2 && isMeta)
                throw new Weigering();
            if (methode === 1 && !idat)
                throw new Weigering();
            const nul = methode === 1 ? idat.inhoud : 0;
            const van = nul + basis + off;
            const tot = len ? van + len : methode === 1 ? idat.tot : b.length;
            if (isMeta && (!len || van < 0 || tot > b.length || van >= tot))
                throw new Weigering();
            if (isMeta) {
                if (metaItems.length >= MAX_CONTAINERS)
                    throw new Weigering();
                metaItems.push({ soort: soort, van, tot });
            }
            else if (methode === 0)
                beeldBereiken.push([van, tot]);
        }
    }
    const raaktBeeld = raakt(beeldBereiken);
    const opVolgorde = [...metaItems].sort((a, z) => a.van - z.van);
    for (let i = 1; i < opVolgorde.length; i++)
        if (opVolgorde[i].van < opVolgorde[i - 1].tot)
            throw new Weigering();
    for (const m of metaItems) {
        if (raaktBeeld([m.van, m.tot]))
            throw new Weigering();
        if (m.soort === "Exif" && m.tot - m.van > 4)
            voegToe(containers, { soort: "tiff", van: m.van + 4 + u32be(b, m.van), tot: m.tot });
        if (m.soort === "XMP")
            voegToe(containers, { soort: "xmp", van: m.van, tot: m.tot });
    }
    return { containers };
}
function pngBlokken(b) {
    const uit = [];
    let o = 8;
    while (o + 12 <= b.length) {
        if (uit.length > PLAFOND)
            throw new Weigering();
        const lengte = u32be(b, o);
        if (o + 12 + lengte > b.length)
            break;
        const soort = latin1(b, o + 4, o + 8);
        uit.push({ o, lengte, soort, inhoud: o + 8 });
        o += 12 + lengte;
        if (soort === "IEND")
            break;
    }
    return uit;
}
function pngSleutel(b, k) {
    return latin1(b, k.inhoud, Math.min(k.inhoud + 80, k.inhoud + k.lengte)).split("\0")[0];
}
function pngLezen(b) {
    const png = pngBlokken(b);
    const containers = [];
    for (const k of png) {
        const eind = k.inhoud + k.lengte;
        if (k.soort === "eXIf")
            voegToe(containers, { soort: "tiff", van: k.inhoud, tot: eind });
        if (k.soort === "iTXt" && /^XML:com\.adobe\.xmp$/i.test(pngSleutel(b, k))) {
            let p = k.inhoud + pngSleutel(b, k).length + 1;
            if (b[p] !== 0)
                continue;
            p += 2;
            for (let n = 0; n < 2; n++) {
                while (p < eind && b[p] !== 0)
                    p++;
                p++;
            }
            if (p <= eind)
                voegToe(containers, { soort: "xmp", van: p, tot: eind });
        }
    }
    return { containers, png };
}
function pngWeg(b, k) {
    if (k.soort !== "zTXt" && k.soort !== "iTXt" && k.soort !== "tEXt")
        return false;
    const sleutel = pngSleutel(b, k);
    if (/gps|location|city|country|^exif:/i.test(sleutel))
        return true;
    if (/^Raw profile type (exif|xmp|app1|iptc|8bim)$/i.test(sleutel))
        return true;
    if (!/^XML:com\.adobe\.xmp$/i.test(sleutel))
        return false;
    return k.soort !== "iTXt" || b[k.inhoud + sleutel.length + 1] === 1;
}
function webpLezen(b) {
    const containers = [];
    let o = 12;
    let n = 0;
    while (o + 8 <= b.length) {
        if (++n > PLAFOND)
            throw new Weigering();
        const soort = latin1(b, o, o + 4);
        const lengte = u32le(b, o + 4);
        const inhoud = o + 8;
        if (inhoud + lengte > b.length)
            break;
        if (soort === "EXIF")
            voegToe(containers, { soort: "tiff", van: latin1(b, inhoud, inhoud + 6) === "Exif\0\0" ? inhoud + 6 : inhoud, tot: inhoud + lengte });
        if (soort === "XMP ")
            voegToe(containers, { soort: "xmp", van: inhoud, tot: inhoud + lengte });
        o = inhoud + lengte + (lengte % 2);
    }
    return { containers };
}
const BEELDMERKEN = /^(heic|heix|heim|heis|hevc|hevx|mif1|msf1|avif|avis|miaf)$/;
function soortVan(b) {
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
        return "jpeg";
    if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x))
        return "png";
    if (latin1(b, 0, 4) === "RIFF" && latin1(b, 8, 12) === "WEBP")
        return "webp";
    if (latin1(b, 4, 8) === "ftyp") {
        const merken = [latin1(b, 8, 12), ...Array.from({ length: Math.max(0, Math.min(16, (u32be(b, 0) - 16) / 4)) }, (_, i) => latin1(b, 16 + i * 4, 20 + i * 4))];
        return merken.some((m) => BEELDMERKEN.test(m)) ? "heif" : "video";
    }
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 0x2a))
        return "tiff";
    if (b.length >= 8 && /^(moov|mdat|wide|free|skip|pnot)$/.test(latin1(b, 4, 8)) && (u32be(b, 0) === 0 || u32be(b, 0) === 1 || (u32be(b, 0) >= 8 && u32be(b, 0) <= b.length)))
        return "video";
    return null;
}
function lezen(b) {
    switch (soortVan(b)) {
        case "jpeg":
            return jpegLezen(b);
        case "png":
            return pngLezen(b);
        case "webp":
            return webpLezen(b);
        case "heif": {
            const l = heifLezen(b);
            for (const c of mp4Lezen(b, 0, b.length))
                voegToe(l.containers, c);
            return l;
        }
        case "video":
            return { containers: mp4Lezen(b, 0, b.length) };
        case "tiff": {
            const c = { soort: "tiff", van: 0, tot: b.length };
            c.beschermd = tiffBeelddata(b, c);
            return { containers: [c] };
        }
        default:
            return null;
    }
}
function tiffLezer(b, start, eind) {
    if (start < 0 || start + 8 > eind)
        return null;
    const le = b[start] === 0x49 && b[start + 1] === 0x49 && b[start + 2] === 0x2a && b[start + 3] === 0;
    const be = b[start] === 0x4d && b[start + 1] === 0x4d && b[start + 2] === 0 && b[start + 3] === 0x2a;
    if (!le && !be)
        return null;
    const u16 = (o) => (o < start || o + 2 > eind ? -1 : le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
    const u32 = (o) => (o < start || o + 4 > eind ? -1 : le ? u32le(b, o) : u32be(b, o));
    return { u16, u32 };
}
function ifdVelden(t, start, eind, ifd) {
    if (ifd < 8)
        return null;
    const n = t.u16(start + ifd);
    if (n < 0 || n > 512 || start + ifd + 2 + n * 12 > eind)
        return null;
    const uit = [];
    for (let i = 0; i < n; i++) {
        const e = start + ifd + 2 + i * 12;
        uit.push({ e, tag: t.u16(e), type: t.u16(e + 2), aantal: t.u32(e + 4), waarde: t.u32(e + 8) });
    }
    return uit;
}
function ifdKetting(t, start, eind) {
    const uit = [];
    const gezien = new Set();
    let ifd = t.u32(start + 4);
    for (let i = 0; i < 4 && ifd >= 8 && !gezien.has(ifd); i++) {
        gezien.add(ifd);
        const velden = ifdVelden(t, start, eind, ifd);
        if (!velden)
            break;
        uit.push({ ifd, velden });
        const exif = velden.find((v) => v.tag === EXIF_IFD)?.waarde;
        const ev = exif !== undefined ? ifdVelden(t, start, eind, exif) : null;
        if (ev && exif !== undefined)
            uit.push({ ifd: exif, velden: ev });
        ifd = t.u32(start + ifd + 2 + velden.length * 12);
    }
    return uit;
}
function veldWaarden(t, start, eind, v) {
    const grootte = v.type === 3 ? 2 : 4;
    if ((v.type !== 3 && v.type !== 4) || v.aantal < 1 || v.aantal > PLAFOND)
        return [];
    const plek = v.aantal * grootte <= 4 ? v.e + 8 : start + v.waarde;
    if (plek + v.aantal * grootte > eind)
        return [];
    const uit = [];
    for (let i = 0; i < v.aantal; i++)
        uit.push(grootte === 2 ? t.u16(plek + i * 2) : t.u32(plek + i * 4));
    return uit;
}
function tiffBeelddata(b, c) {
    const t = tiffLezer(b, c.van, c.tot);
    if (!t)
        return [];
    const uit = [];
    const paren = [
        [0x0111, 0x0117],
        [0x0144, 0x0145],
        [0x0201, 0x0202],
    ];
    for (const { velden } of ifdKetting(t, c.van, c.tot)) {
        for (const [offTag, lenTag] of paren) {
            const offs = velden.find((v) => v.tag === offTag);
            const lens = velden.find((v) => v.tag === lenTag);
            if (!offs || !lens)
                continue;
            const o = veldWaarden(t, c.van, c.tot, offs);
            const l = veldWaarden(t, c.van, c.tot, lens);
            for (let i = 0; i < Math.min(o.length, l.length); i++) {
                if (uit.length >= PLAFOND)
                    throw new Weigering();
                uit.push([c.van + o[i], c.van + o[i] + l[i]]);
            }
        }
    }
    return uit;
}
function tiffHeeftLocatie(b, c) {
    const t = tiffLezer(b, c.van, c.tot);
    if (!t)
        return false;
    return ifdKetting(t, c.van, c.tot).some(({ velden }) => {
        const gps = velden.find((v) => v.tag === GPS_IFD)?.waarde;
        const gv = gps !== undefined ? ifdVelden(t, c.van, c.tot, gps) : null;
        return !!gv?.some((v) => v.tag === GPS_BREEDTE || v.tag === GPS_LENGTE);
    });
}
function tiffBereiken(b, c) {
    const t = tiffLezer(b, c.van, c.tot);
    if (!t)
        return [];
    const start = c.van;
    const ketting = ifdKetting(t, start, c.tot);
    const beschermd = [
        [start, start + 8],
        ...ketting.map(({ ifd, velden }) => [start + ifd, start + ifd + 2 + velden.length * 12 + 4]),
        ...(c.beschermd ?? []),
    ];
    const raaktBeschermd = raakt(beschermd);
    const raaktBeeld = raakt(c.beschermd ?? []);
    const veilig = (van, tot) => van >= start + 8 && tot <= c.tot && van < tot && !raaktBeschermd([van, tot]);
    const uit = [];
    const gehad = new Set();
    for (const { velden } of ketting) {
        const gps = velden.find((v) => v.tag === GPS_IFD)?.waarde;
        if (gps === undefined || gehad.has(gps))
            continue;
        gehad.add(gps);
        const gv = ifdVelden(t, start, c.tot, gps);
        if (!gv)
            continue;
        for (const v of gv) {
            const grootte = (TYPE_BYTES[v.type] ?? 1) * Math.max(0, v.aantal);
            if (grootte > 4 && v.aantal <= 0x100000 && veilig(start + v.waarde, start + v.waarde + grootte))
                uit.push([start + v.waarde, start + v.waarde + grootte]);
        }
        const tabel = [start + gps, start + gps + 2 + gv.length * 12];
        if (raaktBeeld(tabel))
            throw new Weigering();
        uit.push(tabel);
    }
    return uit;
}
const PLAATSVELD = "(?:GPS(?:Dest)?(?:Latitude|Longt?itude)(?:Ref)?|GPSAltitude|GPSAreaInformation|GPSPosition|Gps(?:Latitude|Longt?itude|Altitude)|City|State|Country|CountryName|CountryCode|Sublocation|ProvinceState|Location|LocationCreated|LocationShown|WorldRegion)";
const PLAATS_NAAM = new RegExp(`^${PLAATSVELD}$`);
const GEEN_WAARDE = /^(xmlns(:.*)?|xml:lang|rdf:parseType|rdf:about)$/;
const naamTeken = (c) => (c >= 48 && c <= 58) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45 || c === 46 || c >= 0x80;
const wit = (c) => c === 32 || c === 9 || c === 10 || c === 13;
const lokaal = (naam) => naam.slice(naam.lastIndexOf(":") + 1);
function xmpTreffers(tekst, basis) {
    const uit = [];
    const neem = (van, tot) => {
        if (uit.length >= MAX_CONTAINERS)
            throw new Weigering();
        uit.push([basis + van, basis + tot]);
    };
    const L = tekst.length;
    const tekens = new Int32Array(L + 1);
    const open = [];
    let binnenPlaats = 0;
    let plaatstags = 0;
    let stap = 0;
    let i = 0;
    const vulTot = (tot, telt) => {
        for (; i < tot; i++)
            tekens[i + 1] = tekens[i] + (telt && tekst.charCodeAt(i) > 32 ? 1 : 0);
    };
    while (i < L) {
        if ((++stap & 4095) === 0)
            opTijd();
        const lt = tekst.indexOf("<", i);
        if (lt < 0) {
            vulTot(L, true);
            break;
        }
        vulTot(lt, true);
        if (tekst.startsWith("<![CDATA[", lt)) {
            const eind = tekst.indexOf("]]>", lt + 9);
            vulTot(lt + 9, false);
            vulTot(eind < 0 ? L : eind, true);
            vulTot(eind < 0 ? L : eind + 3, false);
            continue;
        }
        if (/^<!(DOCTYPE|ENTITY)/i.test(tekst.slice(lt, lt + 9)))
            throw new Weigering();
        if (tekst.startsWith("<!--", lt) || tekst.startsWith("<?", lt) || tekst.startsWith("<!", lt)) {
            const sluit = tekst.startsWith("<!--", lt) ? "-->" : tekst.startsWith("<?", lt) ? "?>" : ">";
            const eind = tekst.indexOf(sluit, lt + 2);
            vulTot(eind < 0 ? L : eind + sluit.length, false);
            continue;
        }
        let p = lt + 1;
        const sluitTag = tekst.charCodeAt(p) === 47;
        if (sluitTag)
            p++;
        const naamBegin = p;
        while (p < L && naamTeken(tekst.charCodeAt(p)))
            p++;
        const volledig = tekst.slice(naamBegin, p);
        const attributen = [];
        while (p < L) {
            const c = tekst.charCodeAt(p);
            if (c === 62)
                break;
            if (c === 34 || c === 39) {
                const e = tekst.indexOf(c === 34 ? '"' : "'", p + 1);
                p = e < 0 ? L : e + 1;
                continue;
            }
            if (!naamTeken(c)) {
                p++;
                continue;
            }
            const nb = p;
            while (p < L && naamTeken(tekst.charCodeAt(p)))
                p++;
            const naam = tekst.slice(nb, p);
            let q = p;
            while (q < L && wit(tekst.charCodeAt(q)))
                q++;
            if (tekst.charCodeAt(q) !== 61)
                continue;
            q++;
            while (q < L && wit(tekst.charCodeAt(q)))
                q++;
            const qc = tekst.charCodeAt(q);
            if (qc !== 34 && qc !== 39) {
                p = q;
                continue;
            }
            const e = tekst.indexOf(qc === 34 ? '"' : "'", q + 1);
            if (e < 0) {
                attributen.push({ naam, van: q + 1, tot: L });
                p = L;
                break;
            }
            attributen.push({ naam, van: q + 1, tot: e });
            p = e + 1;
        }
        if (p >= L) {
            if ((volledig !== "" && PLAATS_NAAM.test(lokaal(volledig))) || binnenPlaats > 0 || attributen.some((a) => PLAATS_NAAM.test(lokaal(a.naam))))
                throw new Weigering();
            vulTot(L, false);
            break;
        }
        const zelfSluitend = tekst.charCodeAt(p - 1) === 47;
        vulTot(p + 1, false);
        const plaats = volledig !== "" && PLAATS_NAAM.test(lokaal(volledig));
        if (plaats && ++plaatstags > PLAFOND)
            throw new Weigering();
        for (const a of attributen) {
            if (GEEN_WAARDE.test(a.naam))
                continue;
            if (!(plaats || binnenPlaats > 0 || PLAATS_NAAM.test(lokaal(a.naam))))
                continue;
            if (tekst.slice(a.van, a.tot).trim())
                neem(a.van, a.tot);
        }
        if (zelfSluitend || volledig === "")
            continue;
        if (!sluitTag) {
            if (open.length >= 256)
                throw new Weigering();
            open.push({ naam: volledig, begin: p + 1, plaats });
            if (plaats)
                binnenPlaats++;
            continue;
        }
        const boven = open[open.length - 1];
        if (!boven || boven.naam !== volledig) {
            if (plaats || binnenPlaats > 0)
                throw new Weigering();
            continue;
        }
        open.pop();
        if (!boven.plaats)
            continue;
        binnenPlaats--;
        if (tekens[lt] - tekens[boven.begin] > 0)
            neem(boven.begin, lt);
    }
    if (binnenPlaats > 0)
        throw new Weigering();
    return uit;
}
function xmpBereiken(b, c) {
    return xmpTreffers(latin1(b, c.van, c.tot), c.van);
}
function xmpExtBereiken(b, cs) {
    const uit = [];
    const perGuid = new Map();
    for (const c of cs) {
        const lijst = perGuid.get(c.guid);
        if (lijst)
            lijst.push(c);
        else
            perGuid.set(c.guid, [c]);
    }
    for (const stukken of perGuid.values()) {
        const perOffset = new Map();
        let heel = true;
        for (const s of stukken) {
            const eerder = perOffset.get(s.offset);
            if (!eerder)
                perOffset.set(s.offset, s);
            else if (!alsBuffer(b.subarray(eerder.van, eerder.tot)).equals(b.subarray(s.van, s.tot)))
                heel = false;
        }
        const opVolgorde = [...perOffset.values()].sort((a, z) => a.offset - z.offset);
        let volgende = 0;
        for (const s of opVolgorde) {
            if (s.offset !== volgende)
                heel = false;
            volgende = s.offset + (s.tot - s.van);
        }
        const vol = u32be(b, stukken[0].van - 8);
        if (volgende !== vol || stukken.some((s) => u32be(b, s.van - 8) !== vol))
            heel = false;
        let raak = !heel && stukken.some((s) => !leeg(b, s.van, s.tot));
        if (heel)
            try {
                raak = xmpTreffers(opVolgorde.map((s) => latin1(b, s.van, s.tot)).join(""), 0).length > 0;
            }
            catch (e) {
                if (!(e instanceof Weigering) || Date.now() > deadline)
                    throw e;
                raak = true;
            }
        if (raak)
            for (const s of stukken)
                if (s.tot > s.van)
                    uit.push({ c: s, r: [s.van, s.tot] });
    }
    return uit;
}
const IPTC_PLAATS = new Set([26, 27, 90, 92, 95, 100, 101]);
const leeg = (b, van, tot) => {
    for (let i = van; i < tot; i++)
        if (b[i] !== 0x20 && b[i] !== 0)
            return false;
    return true;
};
function iptcBereiken(b, c) {
    const uit = [];
    let o = c.van;
    let n = 0;
    const lengtePlek = (o) => {
        const naam = b[o + 6];
        const kandidaten = [o + 7 + naam + ((1 + naam) % 2), o + 7 + naam];
        for (const p of kandidaten) {
            if (p + 4 > c.tot)
                continue;
            const eind = p + 4 + u32be(b, p);
            if (eind === c.tot || eind + 1 === c.tot || latin1(b, eind, eind + 4) === "8BIM" || latin1(b, eind + 1, eind + 5) === "8BIM")
                return p;
        }
        return kandidaten[0];
    };
    while (o + 12 <= c.tot && latin1(b, o, o + 4) === "8BIM") {
        if (++n > PLAFOND)
            throw new Weigering();
        const id = u16be(b, o + 4);
        const p0 = lengtePlek(o);
        const lengte = u32be(b, p0);
        const van = p0 + 4;
        const tot = van + lengte;
        if (tot > c.tot)
            throw new Weigering();
        if (id === 0x0404) {
            let p = van;
            let m = 0;
            while (p + 5 <= tot && b[p] === 0x1c) {
                if (++m > PLAFOND)
                    throw new Weigering();
                const record = b[p + 1];
                const dataset = b[p + 2];
                const len = u16be(b, p + 3);
                if (len & 0x8000)
                    throw new Weigering();
                if (p + 5 + len > tot)
                    throw new Weigering();
                if (record === 2 && IPTC_PLAATS.has(dataset) && len > 0 && !leeg(b, p + 5, p + 5 + len))
                    uit.push([p + 5, p + 5 + len]);
                p += 5 + len;
            }
        }
        o = tot + (lengte % 2);
    }
    return uit;
}
function teWissen(b, l) {
    const uit = [];
    const ext = [];
    let xmp = 0;
    for (const c of l.containers) {
        opTijd();
        if (c.soort === "tiff" && tiffHeeftLocatie(b, c))
            for (const r of tiffBereiken(b, c))
                uit.push({ c, r, met: 0 });
        if (c.soort === "xmp" || c.soort === "xmp-ext") {
            xmp += c.tot - c.van;
            if (xmp > XMP_MAX)
                throw new Weigering();
        }
        if (c.soort === "xmp")
            for (const r of xmpBereiken(b, c))
                uit.push({ c, r, met: 0x20 });
        if (c.soort === "xmp-ext")
            ext.push(c);
        if (c.soort === "iptc")
            for (const r of iptcBereiken(b, c))
                uit.push({ c, r, met: 0x20 });
        if (c.soort === "tekst" && !leeg(b, c.van, c.tot))
            uit.push({ c, r: [c.van, c.tot], met: 0x20 });
        if (c.soort === "box") {
            uit.push({ c, r: [c.van, c.van + 4], met: "free" });
            if (c.inhoud < c.tot)
                uit.push({ c, r: [c.inhoud, c.tot], met: 0 });
        }
    }
    for (const w of xmpExtBereiken(b, ext))
        uit.push({ ...w, met: 0x20 });
    if (uit.length > PLAFOND)
        throw new Weigering();
    return uit;
}
const BEELD_EXT = /\.(jpe?g|jfif|pjpeg|png|apng|webp|avif|heic|heif|tiff?|dng|gif|bmp|ico|mp4|m4v|mov)$/i;
export function heeftLocatie(pad, inhoud) {
    if (!BEELD_EXT.test(pad))
        return false;
    zetDeadline();
    try {
        const l = lezen(inhoud);
        if (!l)
            return false;
        return !!l.onvolledig || teWissen(inhoud, l).length > 0 || (l.png ?? []).some((k) => pngWeg(inhoud, k));
    }
    catch (e) {
        return e instanceof Weigering;
    }
}
export function fotosMetLocatie(bestanden) {
    return bestanden.filter((b) => heeftLocatie(b.pad, b.inhoud)).map((b) => b.pad).sort();
}
const CRC_TABEL = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();
function crc32(b) {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++)
        c = CRC_TABEL[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}
export function zonderLocatie(pad, inhoud) {
    if (!BEELD_EXT.test(pad))
        return inhoud;
    zetDeadline();
    try {
        const l = lezen(inhoud);
        if (!l)
            return inhoud;
        const wis = teWissen(inhoud, l);
        const weg = new Set((l.png ?? []).filter((k) => pngWeg(inhoud, k)));
        if (!wis.length && !weg.size)
            return inhoud;
        if (!wis.every(({ c, r: [van, tot] }) => van < tot && van >= c.van && tot <= c.tot))
            return inhoud;
        const uit = new Uint8Array(inhoud);
        for (const met of [0, 0x20, "free"]) {
            const bereiken = wis.filter((w) => w.met === met).map((w) => w.r).sort((a, z) => a[0] - z[0]);
            let [van, tot] = [-1, -1];
            for (const [a, z] of [...bereiken, [Infinity, Infinity]]) {
                if (a <= tot && met !== "free") {
                    tot = Math.max(tot, z);
                    continue;
                }
                if (van >= 0) {
                    if (met === "free")
                        uit.set(Buffer.from("free", "latin1"), van);
                    else
                        uit.fill(met, van, tot);
                }
                [van, tot] = [a, z];
            }
        }
        if (!l.png)
            return uit;
        const delen = [uit.subarray(0, 8)];
        for (const k of l.png) {
            if (weg.has(k))
                continue;
            const eind = k.inhoud + k.lengte;
            if (!alsBuffer(uit.subarray(k.inhoud, eind)).equals(alsBuffer(inhoud.subarray(k.inhoud, eind)))) {
                const c = crc32(uit.subarray(k.o + 4, eind));
                uit[eind] = c >>> 24;
                uit[eind + 1] = (c >>> 16) & 0xff;
                uit[eind + 2] = (c >>> 8) & 0xff;
                uit[eind + 3] = c & 0xff;
            }
            delen.push(uit.subarray(k.o, eind + 4));
        }
        const laatste = l.png[l.png.length - 1];
        if (laatste)
            delen.push(uit.subarray(laatste.inhoud + laatste.lengte + 4));
        return Buffer.concat(delen);
    }
    catch {
        return inhoud;
    }
}
function opbouwGelijk(voor, na) {
    if (soortVan(voor) !== soortVan(na))
        return false;
    zetDeadline();
    try {
        const a = lezen(voor);
        const z = lezen(na);
        if (!a || !z)
            return false;
        if (a.png) {
            const rest = a.png.filter((k) => !pngWeg(voor, k)).map((k) => `${k.soort}:${k.lengte}`);
            return JSON.stringify(rest) === JSON.stringify((z.png ?? []).map((k) => `${k.soort}:${k.lengte}`));
        }
        const za = a.containers.filter((c) => c.soort !== "box");
        const zz = z.containers.filter((c) => c.soort !== "box");
        return na.length === voor.length && za.length === zz.length && za.every((c, i) => c.van === zz[i].van && c.tot === zz[i].tot);
    }
    catch {
        return false;
    }
}
export function haalLocatieWeg(bestanden) {
    const weg = [];
    const niet = [];
    const einde = Date.now() + PUBLICATIE_MS;
    const uit = bestanden.map((b) => {
        if (!BEELD_EXT.test(b.pad))
            return b;
        if (Date.now() > einde) {
            if (soortVan(b.inhoud))
                niet.push(b.pad);
            return b;
        }
        vasteDeadline = Math.min(einde, Date.now() + TIJD_MS);
        try {
            if (!heeftLocatie(b.pad, b.inhoud))
                return b;
            const schoon = zonderLocatie(b.pad, b.inhoud);
            const goed = schoon !== b.inhoud && opbouwGelijk(b.inhoud, schoon);
            if (goed && !heeftLocatie(b.pad, schoon)) {
                weg.push(b.pad);
                return { ...b, inhoud: schoon };
            }
            niet.push(b.pad);
            return goed ? { ...b, inhoud: schoon } : b;
        }
        finally {
            vasteDeadline = 0;
        }
    });
    return { bestanden: uit, weg: weg.sort(), niet: niet.sort() };
}
export function locatieWaarschuwing(files) {
    if (!files.length)
        return [];
    return [
        {
            code: "photo_location",
            files,
            message: files.length === 1
                ? "1 photo may still contain a GPS location; we could not remove it with certainty. Anyone who downloads it could see where it was taken. Remove the location and publish again."
                : `${files.length} photos may still contain a GPS location; we could not remove it with certainty. Anyone who downloads them could see where they were taken. Remove the location and publish again.`,
        },
    ];
}
export function weggehaaldMelding(weg) {
    if (!weg.length)
        return [];
    return [
        {
            code: "photo_location_removed",
            files: weg,
            message: weg.length === 1 ? "We removed the GPS location from 1 photo before publishing it." : `We removed the GPS location from ${weg.length} photos before publishing them.`,
        },
    ];
}
