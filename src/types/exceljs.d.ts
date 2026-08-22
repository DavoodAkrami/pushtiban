declare module "@excel.js/exceljs" {
  type CellValue = unknown;

  export type Worksheet = {
    name: string;
    eachRow: (
      options: { includeEmpty: boolean },
      callback: (row: { values: CellValue[] }, rowNumber: number) => void
    ) => void;
  };

  export class Workbook {
    worksheets: Worksheet[];
    csv: { load: (buffer: Buffer) => Promise<Workbook> };
    xlsx: {
      load: (
        buffer: Buffer,
        options?: { ignoreNodes?: string[] }
      ) => Promise<Workbook>;
    };
  }

  const ExcelJs: { Workbook: typeof Workbook };
  export default ExcelJs;
}
