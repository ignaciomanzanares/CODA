/**
 * Conectores de fuentes de datos institucionales (Fase 5): AFP, SII, Tesorería.
 *
 * Flujo guiado: el usuario descarga el PDF oficial con Clave Única en el sitio de la fuente y lo
 * sube aquí. Se extraen los datos (mejor esfuerzo, ver services/dataSources/govParsers.ts) y se
 * persisten para enriquecer los ratios de salud. NO manejamos credenciales del usuario.
 */
import type { Express, Request, Response } from 'express';
import { authenticate, type AuthenticatedRequest } from './middleware/auth.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { logger } from './logger.js';
import type { GovSource } from './services/dataSources/types.js';

const VALID_SOURCES: GovSource[] = ['afp', 'sii', 'tgr'];

export function registerDataSourceRoutes(app: Express) {
  // Sube el PDF oficial de una fuente y extrae sus datos.
  app.post('/api/data-sources/:source', apiLimiter, authenticate, async (req: Request, res: Response) => {
    const source = req.params.source as GovSource;
    if (!VALID_SOURCES.includes(source)) {
      return res.status(400).json({ message: 'Fuente inválida. Usa afp, sii o tgr.' });
    }

    const { documentUpload } = await import('./middleware/uploadMiddleware.js');
    documentUpload.single('file')(req, res, async (uploadErr: unknown) => {
      if (uploadErr) {
        const msg = uploadErr instanceof Error ? uploadErr.message : 'Archivo inválido.';
        return res.status(400).json({ message: msg });
      }
      const file = (req as Request & { file?: { buffer: Buffer } }).file;
      if (!file) {
        return res.status(400).json({ message: 'Se requiere el PDF oficial de la fuente.' });
      }
      try {
        const userId = (req as AuthenticatedRequest).user!.userId;
        const { extractPdfText } = await import('./services/documents/pdfAnalysis.js');
        const { text } = await extractPdfText(file.buffer);

        const { detectGovSource, parseGovDocument } = await import('./services/dataSources/govParsers.js');
        const detected = detectGovSource(text);
        if (detected && detected !== source) {
          return res.status(400).json({
            message: `El documento parece ser de ${detected.toUpperCase()}, no de ${source.toUpperCase()}. Verifica que subiste el archivo correcto.`,
          });
        }

        const result = parseGovDocument(source, text);
        if (!result.ok) {
          return res.status(422).json({ message: result.message ?? 'No se pudieron extraer los datos del documento.', source });
        }

        const { saveGovSourceData } = await import('./services/dataSources/govSourceService.js');
        await saveGovSourceData(userId, result);

        res.json({
          ok: true,
          source,
          data: {
            verifiedMonthlyIncomeClp: result.verifiedMonthlyIncomeClp ?? null,
            fiscalDebtClp: result.fiscalDebtClp ?? null,
            contributionMonths: result.contributionMonths ?? null,
          },
        });
      } catch (e) {
        logger.error({ err: e, source }, '[dataSources] upload falló');
        res.status(500).json({ message: 'Error al procesar el documento.' });
      }
    });
  });

  // Estado de las fuentes conectadas por el usuario.
  app.get('/api/data-sources', authenticate, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.userId;
      const { getGovSources } = await import('./services/dataSources/govSourceService.js');
      res.json({ sources: await getGovSources(userId) });
    } catch (e) {
      logger.error({ err: e }, '[dataSources] getGovSources falló');
      res.status(500).json({ message: 'Error al obtener las fuentes.' });
    }
  });
}
