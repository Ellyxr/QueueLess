import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const message =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
        ? exceptionResponse.message
        : status === 500
          ? 'Internal server error'
          : exceptionResponse ?? 'Request failed';

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.path}`,
        exception instanceof Error ? exception.stack : 'Unknown server exception',
      );
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status],
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
