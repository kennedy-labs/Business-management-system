export interface MpesaReportItem {
  id: string;
  /** Money moved during the period: closingBalance - openingBalance. */
  amount: number;
  openingBalance: number;
  closingBalance: number | null;
  openingAt: Date;
  closingAt: Date | null;
  /** OPEN while the closing balance has not been recorded yet. */
  status: string;
  shiftId: string;
}

export interface MpesaReport {
  items: MpesaReportItem[];
  totalReceived: number;
  generatedAt: Date;
}
