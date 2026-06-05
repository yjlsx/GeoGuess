import type { OsintLink } from "./types";

type CoordinateLinkInput = {
  latitude: number;
  longitude: number;
  label?: string;
};

function fixed(value: number) {
  return value.toFixed(5);
}

function labelText(label?: string) {
  return label?.trim() || "candidate location";
}

export function buildCandidateOsintLinks({ latitude, longitude, label }: CoordinateLinkInput): OsintLink[] {
  const lat = fixed(latitude);
  const lon = fixed(longitude);
  const zoom = 16;
  const noteTarget = labelText(label);

  return [
    {
      title: "OpenStreetMap nearby",
      url: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`,
      note: `Check roads, buildings, land use, and named nearby features around ${noteTarget}.`
    },
    {
      title: "OpenRailwayMap nearby",
      url: `https://www.openrailwaymap.org/?style=standard&lat=${lat}&lon=${lon}&zoom=${zoom}`,
      note: `Check railway alignments, stations, sidings, and crossings around ${noteTarget}.`
    },
    {
      title: "Mapillary street-level imagery",
      url: `https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=${zoom}`,
      note: `Look for street-level imagery that can confirm the viewpoint near ${noteTarget}.`
    },
    {
      title: "KartaView street-level imagery",
      url: `https://kartaview.org/map/@${lat},${lon},${zoom}z`,
      note: `Look for alternate street-level coverage near ${noteTarget}.`
    },
    {
      title: "SunCalc shadow check",
      url: `https://www.suncalc.org/#/${lat},${lon},${zoom}`,
      note: `Compare shadow direction and possible capture time for ${noteTarget}.`
    }
  ];
}

export function buildReverseImageSearchLinks(publicImageUrl: string): OsintLink[] {
  const encoded = encodeURIComponent(publicImageUrl);

  return [
    {
      title: "Google Lens reverse image search",
      url: `https://lens.google.com/uploadbyurl?url=${encoded}`,
      note: "Search for visually similar images or reposts of the uploaded frame."
    },
    {
      title: "Bing Visual Search",
      url: `https://www.bing.com/images/search?view=detailv2&iss=sbi&form=SBIIRP&sbisrc=UrlPaste&q=imgurl:${encoded}`,
      note: "Search Bing for visually similar images and source pages."
    },
    {
      title: "Yandex Images",
      url: `https://yandex.com/images/search?rpt=imageview&url=${encoded}`,
      note: "Search Yandex for visually similar images and reposted frames."
    },
    {
      title: "TinEye reverse image search",
      url: `https://tineye.com/search?url=${encoded}`,
      note: "Search TinEye for exact or near-exact image matches."
    }
  ];
}
