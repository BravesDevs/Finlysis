import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { ImportService } from './import.service';
import { ImportTransactionsDto } from './dto';

const ALLOWED_MIMETYPES = new Set(['text/csv', 'application/vnd.ms-excel']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

@Controller('import')
@UseGuards(AccessTokenGuard)
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /**
   * POST /import/transactions
   * Accepts a CSV file (multipart/form-data) and schedules an async import.
   * Returns the importBatchId immediately for polling.
   */
  @Post('transactions')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }),
  )
  importTransactions(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportTransactionsDto,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Only CSV files are accepted.`,
      );
    }
    return this.importService.importTransactions(user.userId, dto, file);
  }

  /**
   * GET /import/batches
   * Lists all import batches for the current user (no errorLog).
   */
  @Get('batches')
  listBatches(@CurrentUser() user: JwtPayload) {
    return this.importService.listBatches(user.userId);
  }

  /**
   * GET /import/batches/:id
   * Returns a single import batch including full errorLog.
   */
  @Get('batches/:id')
  getBatch(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.importService.getBatch(user.userId, id);
  }
}
