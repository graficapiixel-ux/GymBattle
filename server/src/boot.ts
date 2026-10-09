/**
 * Carregado ANTES de tudo no servidor compilado.
 * Define padrões seguros para produção quando a hospedagem não informa:
 *  - NODE_ENV=production (sem precisar configurar no painel — se configurar,
 *    alguns painéis deixam de instalar as dependências de build);
 *  - pasta de fotos FORA da pasta do build, para não perder as fotos a cada deploy.
 */
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV ||= 'production';
if (!process.env.UPLOAD_DIR && process.env.NODE_ENV === 'production') {
  process.env.UPLOAD_DIR = path.join(os.homedir(), 'gymbattle-data', 'uploads');
}
