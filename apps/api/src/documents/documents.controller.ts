import { Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@hisobai/contracts';
import type { DocumentGenerateDto, DocumentVersionDto } from '@hisobai/contracts';

import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { DocumentsService } from './documents.service';

/**
 * Shartnoma hujjatlari — nasiya PDF'i (§15, §16.10).
 *
 * `Idempotency-Key` shart EMAS: `POST /documents/contracts/:id/pdf`
 * `API.md` §4.1 ro'yxatida yo'q — u pul harakatlantirmaydi, faqat mavjud
 * snapshot'dan hujjat quradi, va o'zi ham allaqachon idempotent (§15.2
 * dedup — bir xil mazmun uchun yangi versiya ochilmaydi).
 */
@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post('contracts/:id/pdf')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Nasiya shartnomasi PDF\'ini yaratish (§15.2, §16.10)' })
  generate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<DocumentGenerateDto> {
    return this.documents.generate(id, user, request.ip ?? null);
  }

  @Get('contracts/:id')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Shartnoma hujjatlari versiyalari (yangisidan eskisiga)' })
  listVersions(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentVersionDto[]> {
    return this.documents.listVersions(id);
  }
}
