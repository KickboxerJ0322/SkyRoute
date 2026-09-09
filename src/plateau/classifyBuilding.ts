import type { BuildingCategory } from './types';

// App display categories, not official PLATEAU classifications. Numeric codes alone
// carry no meaning here: the generator must resolve their referenced code lists.
export function classifyBuilding(value: { name?: string | null; usage?: string | null; majorUsage?: string | null }): BuildingCategory {
  const text = [value.name, value.usage, value.majorUsage].filter(Boolean).join(' ');
  if (/病院|診療所|医療|クリニック/.test(text)) return 'MEDICAL';
  if (/空港|ターミナル|交通|運輸|公共施設|官公庁|消防署|警察署|区役所|市役所/.test(text)) return 'PUBLIC_TRANSPORT';
  if (/商業|店舗|飲食|ホテル|宿泊/.test(text)) return 'COMMERCIAL';
  return 'OTHER';
}
