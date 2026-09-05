/**
 * Realistic Flight Waypoint Profiles for Haneda (HND) Departures
 * (All altitudes in meters MSL - Mean Sea Level)
 */

import { FlightRoute, Airport } from '../flight/types';

export const AIRPORTS: Record<string, Airport> = {
  HND: {
    code: 'HND',
    icao: 'RJTT',
    name: '東京国際空港（羽田）',
    city: 'Tokyo / Haneda',
    lat: 35.5494,
    lng: 139.7798,
    altitude: 10,
  },
  CTS: {
    code: 'CTS',
    icao: 'RJCC',
    name: '新千歳空港',
    city: 'Sapporo / Chitose',
    lat: 42.7752,
    lng: 141.6923,
    altitude: 25,
  },
  ITM: {
    code: 'ITM',
    icao: 'RJOO',
    name: '大阪国際空港（伊丹）',
    city: 'Osaka / Itami',
    lat: 34.7855,
    lng: 135.4382,
    altitude: 15,
  },
  FUK: {
    code: 'FUK',
    icao: 'RJFF',
    name: '福岡空港',
    city: 'Fukuoka',
    lat: 33.5859,
    lng: 130.4507,
    altitude: 12,
  },
  OKA: {
    code: 'OKA',
    icao: 'ROAH',
    name: '那覇空港',
    city: 'Okinawa / Naha',
    lat: 26.1958,
    lng: 127.6459,
    altitude: 10,
  },
};

export const DEMO_ROUTES: FlightRoute[] = [
  // 1. HND -> CTS (New Chitose)
  {
    id: 'hnd-cts',
    flightNumber: 'SR 511',
    airline: 'SkyRoute Express',
    aircraftType: 'Boeing 787-10 Dreamliner',
    origin: AIRPORTS.HND,
    destination: AIRPORTS.CTS,
    durationSeconds: 180,
    description: '羽田空港発・新千歳空港行き 北日本縦走フライト',
    waypoints: [
      { lat: 35.5494, lng: 139.7798, altitude: 10, name: 'HND Rwy 34R Takeoff' },
      { lat: 35.5850, lng: 139.8520, altitude: 450, name: 'Tokyo Bay Departure' },
      { lat: 35.6580, lng: 140.0150, altitude: 1800, name: 'Chiba Coastal Climb' },
      { lat: 35.9120, lng: 140.2300, altitude: 3800, name: 'Tone River Transition' },
      { lat: 36.3650, lng: 140.4200, altitude: 6800, name: 'Mito Climb Corridor' },
      { lat: 37.1200, lng: 140.4800, altitude: 9400, name: 'Abukuma Mountains' },
      { lat: 38.2800, lng: 140.7100, altitude: 10600, name: 'Sendai Cruise Waypoint' },
      { lat: 39.7200, lng: 140.9600, altitude: 10600, name: 'Morioka Ridge' },
      { lat: 40.8200, lng: 141.1400, altitude: 10600, name: 'Hachinohe Skyway' },
      { lat: 41.5200, lng: 141.2600, altitude: 9200, name: 'Tsugaru Strait Descent' },
      { lat: 42.0800, lng: 141.4100, altitude: 6400, name: 'Uchiura Bay Inbound' },
      { lat: 42.4600, lng: 141.5900, altitude: 3200, name: 'Tomakomai Descent' },
      { lat: 42.6650, lng: 141.7150, altitude: 1300, name: 'Chitose Base Turn' },
      { lat: 42.7380, lng: 141.7040, altitude: 420, name: 'Final Approach Rwy 19L' },
      { lat: 42.7752, lng: 141.6923, altitude: 25, name: 'CTS Touchdown' },
    ],
  },

  // 2. HND -> ITM (Osaka Itami)
  {
    id: 'hnd-itm',
    flightNumber: 'SR 115',
    airline: 'SkyRoute Express',
    aircraftType: 'Boeing 787-10 Dreamliner',
    origin: AIRPORTS.HND,
    destination: AIRPORTS.ITM,
    durationSeconds: 150,
    description: '羽田空港発・大阪伊丹空港行き 東海道幹線フライト',
    waypoints: [
      { lat: 35.5494, lng: 139.7798, altitude: 10, name: 'HND D-Runway Takeoff' },
      { lat: 35.4850, lng: 139.8150, altitude: 420, name: 'Tokyo Bay Turn' },
      { lat: 35.3180, lng: 139.6750, altitude: 1900, name: 'Miura Peninsula' },
      { lat: 35.1520, lng: 139.2100, altitude: 4600, name: 'Sagami Bay Climb' },
      { lat: 35.0850, lng: 138.6200, altitude: 7600, name: 'Suruga Bay / Mt. Fuji' },
      { lat: 34.8950, lng: 137.7800, altitude: 8800, name: 'Hamamatsu Cruise' },
      { lat: 34.7450, lng: 136.8800, altitude: 8800, name: 'Mikawa Bay Corridor' },
      { lat: 34.6950, lng: 136.2100, altitude: 6200, name: 'Suzuka Ridge Descent' },
      { lat: 34.6480, lng: 135.7900, altitude: 3400, name: 'Nara Basin Descent' },
      { lat: 34.6820, lng: 135.5820, altitude: 1500, name: 'Ikoma Approach Transition' },
      { lat: 34.7420, lng: 135.4830, altitude: 480, name: 'Final Approach Rwy 32L' },
      { lat: 34.7855, lng: 135.4382, altitude: 15, name: 'ITM Touchdown' },
    ],
  },

  // 3. HND -> FUK (Fukuoka)
  {
    id: 'hnd-fuk',
    flightNumber: 'SR 317',
    airline: 'SkyRoute Express',
    aircraftType: 'Boeing 787-10 Dreamliner',
    origin: AIRPORTS.HND,
    destination: AIRPORTS.FUK,
    durationSeconds: 190,
    description: '羽田空港発・福岡空港行き 瀬戸内海縦断フライト',
    waypoints: [
      { lat: 35.5494, lng: 139.7798, altitude: 10, name: 'HND Takeoff' },
      { lat: 35.4450, lng: 139.7820, altitude: 500, name: 'Tokyo Bay Departure' },
      { lat: 35.2510, lng: 139.3450, altitude: 2500, name: 'Odawara Ascent' },
      { lat: 35.0480, lng: 138.6920, altitude: 6200, name: 'Suruga Bay Corridor' },
      { lat: 34.7950, lng: 137.1950, altitude: 9600, name: 'Enshu-nada Cruise' },
      { lat: 34.5020, lng: 135.0120, altitude: 11000, name: 'Awaji Island Skyway' },
      { lat: 34.3480, lng: 133.7920, altitude: 11000, name: 'Seto Inland Sea Cruise' },
      { lat: 34.1450, lng: 132.4950, altitude: 11000, name: 'Hiroshima Offshore' },
      { lat: 33.9450, lng: 131.5950, altitude: 8600, name: 'Suo-nada Descent' },
      { lat: 33.8050, lng: 130.8950, altitude: 4800, name: 'Kitakyushu Transition' },
      { lat: 33.6820, lng: 130.5980, altitude: 2200, name: 'Iizuka Inbound Descent' },
      { lat: 33.6210, lng: 130.4910, altitude: 550, name: 'Final Approach Rwy 16' },
      { lat: 33.5859, lng: 130.4507, altitude: 12, name: 'FUK Touchdown' },
    ],
  },

  // 4. HND -> OKA (Naha)
  {
    id: 'hnd-oka',
    flightNumber: 'SR 903',
    airline: 'SkyRoute Express',
    aircraftType: 'Boeing 787-10 Dreamliner',
    origin: AIRPORTS.HND,
    destination: AIRPORTS.OKA,
    durationSeconds: 210,
    description: '羽田空港発・那覇空港行き 太平洋南西諸島フライト',
    waypoints: [
      { lat: 35.5494, lng: 139.7798, altitude: 10, name: 'HND Runway 05 Takeoff' },
      { lat: 35.3950, lng: 139.8120, altitude: 520, name: 'Tokyo Bay Southbound' },
      { lat: 34.8980, lng: 139.5120, altitude: 2900, name: 'Izu Oshima Climb' },
      { lat: 33.9920, lng: 138.9950, altitude: 7200, name: 'Miyakejima Corridor' },
      { lat: 32.7950, lng: 137.4950, altitude: 11500, name: 'Oceanic Highway Entry' },
      { lat: 31.1950, lng: 135.4950, altitude: 11800, name: 'Pacific High Cruise' },
      { lat: 29.4950, lng: 132.9950, altitude: 11800, name: 'Amami High Seas Cruise' },
      { lat: 27.7950, lng: 129.9950, altitude: 11800, name: 'Ryukyu Arc Inbound' },
      { lat: 26.8950, lng: 128.4950, altitude: 8400, name: 'Northern Okinawa Descent' },
      { lat: 26.4950, lng: 127.9950, altitude: 4500, name: 'Nago Offshore Transition' },
      { lat: 26.2950, lng: 127.7450, altitude: 1800, name: 'Kerama Base Turn' },
      { lat: 26.2310, lng: 127.6710, altitude: 480, name: 'Final Approach Rwy 18L' },
      { lat: 26.1958, lng: 127.6459, altitude: 10, name: 'OKA Touchdown' },
    ],
  },
];

