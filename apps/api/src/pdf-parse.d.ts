declare module "pdf-parse" {
  function pdfParse(data: Buffer | Uint8Array): Promise<{ text: string; numpages?: number }>;
  export default pdfParse;
}
