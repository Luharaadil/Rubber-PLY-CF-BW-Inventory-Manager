export interface MaterialUsageRate {
  section: string;
  category: string;
  materialName: string;
  usagePerHour: number;
}

export interface AppSettings {
  materialUsages: MaterialUsageRate[];
}

export interface InventoryRawRecord {
  timestamp: Date;
  barcode: string;
  rubberCode: string;
  weight: number;
  batchesOrRolls?: number;
  section: string;
  isFinalRubber?: boolean;
}

export interface RubberStock {
  rubberCode: string;
  totalWeight: number;
  totalBatches: number;
  estimatedHoursLeft: number | null;
  section: string;
  isFinalRubber?: boolean;
  items: InventoryRawRecord[];
}

export interface User {
  id: string;
  role: string;
}
