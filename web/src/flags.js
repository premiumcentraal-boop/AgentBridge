import CA from "./flags/ca.svg";
import US from "./flags/us.svg";
import MX from "./flags/mx.svg";
import BR from "./flags/br.svg";
import GB from "./flags/gb.svg";
import NL from "./flags/nl.svg";
import DE from "./flags/de.svg";
import SE from "./flags/se.svg";
import FR from "./flags/fr.svg";
import ZA from "./flags/za.svg";
import AE from "./flags/ae.svg";
import IN from "./flags/in.svg";
import SG from "./flags/sg.svg";
import JP from "./flags/jp.svg";
import CH from "./flags/ch.svg";
import AU from "./flags/au.svg";
const sources = {
  CA,
  US,
  MX,
  BR,
  GB,
  NL,
  DE,
  SE,
  FR,
  ZA,
  AE,
  IN,
  SG,
  JP,
  CH,
  AU,
};
// These are local, MIT-licensed vector assets, never user-supplied markup.
// Symbols avoid external image requests and nested SVG image decoding on iOS.
export function flagDefinitions(prefix) {
  return Object.entries(sources).map(([code, source]) => {
    if (
      /<script\b|<foreignObject\b|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/|javascript:)/i.test(
        source,
      )
    )
      throw new Error("Unsafe flag vector: " + code);
    const outer = source.match(/<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/);
    if (!outer) throw new Error("Malformed flag vector: " + code);
    const viewBox = outer[1].match(/viewBox="([^"]+)"/)?.[1] || "0 0 640 480";
    let body = outer[2].replaceAll("xlink:href", "href");
    const ids = [...body.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    for (const id of ids) {
      const scoped = prefix + "-" + code + "-" + id;
      body = body
        .replaceAll('id="' + id + '"', 'id="' + scoped + '"')
        .replaceAll("url(#" + id + ")", "url(#" + scoped + ")")
        .replaceAll('href="#' + id + '"', 'href="#' + scoped + '"');
    }
    return { code, id: prefix + "-flag-" + code, viewBox, body };
  });
}
