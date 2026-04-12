import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // ── Swagger / OpenAPI ──────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('Finlysis API')
    .setDescription(
      'REST API for Finlysis — Canadian personal-finance platform. ' +
      'All protected endpoints require a Bearer access token obtained from POST /auth/login or POST /auth/register. ' +
      'The refresh endpoint requires a Bearer refresh token.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'access-token',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', in: 'header' },
      'refresh-token',
    )
    .addTag('Auth', 'Registration, login, and token refresh')
    .addTag('Users', 'User account management')
    .addTag('Profile', 'User profile (read / update)')
    .addTag('Plaid', 'Plaid Link integration — connect and manage bank accounts')
    .addTag('Import', 'CSV transaction import and batch status tracking')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
  // ───────────────────────────────────────────────────────────────────────────

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application running on port ${process.env.PORT ?? 3000}`);
  console.log(`Swagger docs available at /api/docs`);
}
bootstrap();
