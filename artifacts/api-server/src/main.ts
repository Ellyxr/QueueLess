import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { loadRuntimeConfig } from './config/runtime.config';
import { RenderSocketIoAdapter } from './realtime/socket-io.adapter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: process.env.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : undefined,
  });
  // Read after create() so ConfigModule has loaded a local .env file.
  const config = loadRuntimeConfig();

  // Render terminates TLS at its proxy; trust it so req.ip/req.secure are correct.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.setGlobalPrefix('api/v1');
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // REST and Socket.IO share this one HTTP server and port.
  app.useWebSocketAdapter(new RenderSocketIoAdapter(app, config.corsOrigins));

  // Render sends SIGTERM on deploys/restarts; close Prisma and sockets cleanly.
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('QueueLess API')
    .setDescription('QueueLess foundation API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, document);

  await app.listen(config.port, config.host);
  logger.log(
    `QueueLess API + Socket.IO listening on ${config.host}:${config.port} ` +
      `(${config.isProduction ? 'production' : 'development'}); ` +
      `CORS origins: ${config.corsOrigins.join(', ')}`,
  );
}

bootstrap().catch((error) => {
  // Exit non-zero so Render marks the deploy as failed instead of hanging.
  console.error('Failed to start QueueLess API', error);
  process.exit(1);
});
