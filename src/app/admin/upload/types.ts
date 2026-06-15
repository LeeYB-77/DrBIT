export type ParsedRow = {
  rowIndex: number; // 엑셀 No
  customer: string;
  closing_date: string; // YYYY-MM-DD
  sales_month: string; // YYYY-MM
  customer_code: string | null;
  product_code: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  supply_amount: number;
  vat: number;
  total_amount: number;
  project: string | null;
  rep_name_raw: string;
  rep_id: string | null;
};

export type PreviewResult = {
  filename: string;
  sales_month: string; // 가장 흔한 월 또는 단일 월
  rows: ParsedRow[];
  unmatched_reps: string[]; // profiles에 없는 담당자 이름
  missing_products: string[]; // products에 없는 품번
  warnings: string[];
  totals: {
    count: number;
    supply: number;
    vat: number;
    total: number;
  };
};

export type ParseResult =
  | { ok: true; preview: PreviewResult }
  | { ok: false; error: string };

export type CommitResult =
  | {
      ok: true;
      batch_id: string;
      inserted: number;
      skipped_duplicates: number;
      deleted: number;
      preserved: number;
      missing_in_new_file: number;
    }
  | { ok: false; error: string };
