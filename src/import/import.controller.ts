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
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/decorators/current-user.decorator';
import { ImportService } from './import.service';
import { ImportTransactionsDto } from './dto';

const ALLOWED_MIMETYPES = new Set(['text/csv', 'application/vnd.ms-excel']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Inline schema for the multipart body so Swagger renders file + field correctly
class ImportTransactionsBody {
  @ApiProperty({ type: 'string', format: 'binary', description: 'CSV file (max 10 MB)' })
  file: Express.Multer.File;

  @ApiProperty({ example: 'uuid-of-bank-account', description: 'UUID of the BankAccount this CSV belongs to' })
  bankAccountId: string;
}

class ImportBatchSummary {
  @ApiProperty() id: string;
  @ApiProperty() fileName: string;
  @ApiProperty({ enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] }) status: string;
  @ApiProperty() rowCount: number;
  @ApiProperty() successCount: number;
  @ApiProperty() skippedCount: number;
  @ApiProperty() errorCount: number;
  @ApiProperty({ nullable: true }) completedAt: Date | null;
  @ApiProperty() startedAt: Date;
  @ApiProperty() bankAccountId: string;
}

@ApiTags('Import')
@ApiBearerAuth('access-token')
@UseGuards(AccessTokenGuard)
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /**
   * POST /import/transactions
   */
  @Post('transactions')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES } }),
  )
  @ApiOperation({
    summary: 'Upload a CSV file and import transactions',
    description:
      'Accepts a multipart/form-data request with a CSV file and a bankAccountId. ' +
      'Creates an ImportBatch record immediately and processes the file asynchronously. ' +
      'Poll GET /import/batches/:id to track progress.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: ImportTransactionsBody })
  @ApiResponse({
    status: 201,
    description: 'Import job queued — returns the importBatchId for polling',
    schema: { example: { importBatchId: 'uuid-of-batch' } },
  })
  @ApiResponse({ status: 400, description: 'Missing file, wrong MIME type, or validation error' })
  @ApiResponse({ status: 403, description: 'bankAccountId does not belong to the authenticated user' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
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
   */
  @Get('batches')
  @ApiOperation({
    summary: 'List all import batches for the authenticated user',
    description: 'Returns batches ordered by startedAt DESC. The errorLog field is omitted — use GET /import/batches/:id for full details.',
  })
  @ApiResponse({ status: 200, description: 'Array of ImportBatch summaries', type: [ImportBatchSummary] })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  listBatches(@CurrentUser() user: JwtPayload) {
    return this.importService.listBatches(user.userId);
  }

  /**
   * GET /import/batches/:id
   */
  @Get('batches/:id')
  @ApiOperation({ summary: 'Get a single import batch including the full errorLog' })
  @ApiParam({ name: 'id', description: 'UUID of the ImportBatch', example: 'uuid-of-batch' })
  @ApiResponse({ status: 200, description: 'Full ImportBatch record including errorLog' })
  @ApiResponse({ status: 404, description: 'Batch not found or not owned by current user' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  getBatch(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.importService.getBatch(user.userId, id);
  }
}
