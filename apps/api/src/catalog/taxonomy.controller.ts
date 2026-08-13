import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  UserRole,
  createBrandSchema,
  createCategorySchema,
  mergeTaxonomySchema,
  taxonomyQuerySchema,
  updateBrandSchema,
  updateCategorySchema,
} from '@hisobai/contracts';
import type {
  CreateBrandInput,
  CreateCategoryInput,
  MergeTaxonomyInput,
  Page,
  TaxonomyDto,
  TaxonomyMergeResultDto,
  TaxonomyQuery,
  UpdateBrandInput,
  UpdateCategoryInput,
} from '@hisobai/contracts';

import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { readPrecondition } from '../common/optimistic-lock';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TaxonomyService, type TaxonomyKind } from './taxonomy.service';

/**
 * Kategoriya va brend endpointlari (§4.3, §4.4).
 *
 * Ikkita klass, bitta servis: Nest'da bitta `@Controller` bitta yo'l
 * prefiksiga bog'lanadi, biznes mantiq esa `TaxonomyService` da bir
 * marta yozilgan.
 */

/**
 * Ikkala kontroller uchun umumiy amallar — takrorlanmasin.
 *
 * **DIQQAT.** Bu klassdan meros oladigan har bir kontroller **o'z
 * konstruktorini e'lon qilishi shart**. Nest DI `design:paramtypes`
 * metadatasini aynan yaratilayotgan klassdan o'qiydi va u meros
 * olinmaydi: konstruktorsiz bola klass argumentsiz yaratiladi,
 * `this.taxonomy` esa `undefined` bo'lib qoladi. TypeScript buni
 * ushlamaydi — xato faqat birinchi so'rovda, `500` bo'lib chiqadi.
 */
abstract class TaxonomyControllerBase {
  protected abstract readonly kind: TaxonomyKind;

  constructor(protected readonly taxonomy: TaxonomyService) {}

  protected listOf(query: TaxonomyQuery): Promise<Page<TaxonomyDto>> {
    return this.taxonomy.list(this.kind, query);
  }

  protected createOf(
    name: string,
    user: RequestUser,
    request: AuthedRequest,
  ): Promise<TaxonomyDto> {
    return this.taxonomy.create(this.kind, name, user, request.ip ?? null);
  }

  protected updateOf(
    id: string,
    body: { name?: string; isActive?: boolean; expectedUpdatedAt?: string },
    user: RequestUser,
    request: AuthedRequest,
  ): Promise<TaxonomyDto> {
    const precondition = readPrecondition(request, body.expectedUpdatedAt);
    return this.taxonomy.update(
      this.kind,
      id,
      { name: body.name, isActive: body.isActive },
      precondition,
      user,
      request.ip ?? null,
    );
  }

  protected mergeOf(
    id: string,
    body: MergeTaxonomyInput,
    user: RequestUser,
    request: AuthedRequest,
  ): Promise<TaxonomyMergeResultDto> {
    // Birlashtirish manbani o'zgartiradi, ya'ni `PATCH` kabi qulf talab qiladi
    const precondition = readPrecondition(request, body.expectedUpdatedAt);
    return this.taxonomy.merge(
      this.kind,
      id,
      body.targetId,
      precondition,
      user,
      request.ip ?? null,
    );
  }
}

@ApiTags('categories')
@Controller('categories')
export class CategoriesController extends TaxonomyControllerBase {
  protected readonly kind: TaxonomyKind = 'category';

  // DI metadatasi meros olinmaydi — bazaviy klass izohiga qarang
  constructor(taxonomy: TaxonomyService) {
    super(taxonomy);
  }

  @Get()
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Kategoriyalar ro‘yxati' })
  list(
    @Query(new ZodValidationPipe(taxonomyQuerySchema)) query: TaxonomyQuery,
  ): Promise<Page<TaxonomyDto>> {
    return this.listOf(query);
  }

  @Post()
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Kategoriya qo‘shish (§4.4 — mahsulot formasidan ham)' })
  create(
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<TaxonomyDto> {
    return this.createOf(body.name, user, request);
  }

  @Patch(':id')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Nomni o‘zgartirish yoki arxivlash (§4.8)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: UpdateCategoryInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<TaxonomyDto> {
    return this.updateOf(id, body, user, request);
  }

  @Post(':id/merge')
  @Roles(UserRole.SHOP_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Boshqa kategoriyaga birlashtirish (§4.4)' })
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(mergeTaxonomySchema)) body: MergeTaxonomyInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<TaxonomyMergeResultDto> {
    return this.mergeOf(id, body, user, request);
  }
}

@ApiTags('brands')
@Controller('brands')
export class BrandsController extends TaxonomyControllerBase {
  protected readonly kind: TaxonomyKind = 'brand';

  // DI metadatasi meros olinmaydi — bazaviy klass izohiga qarang
  constructor(taxonomy: TaxonomyService) {
    super(taxonomy);
  }

  @Get()
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Brendlar ro‘yxati' })
  list(
    @Query(new ZodValidationPipe(taxonomyQuerySchema)) query: TaxonomyQuery,
  ): Promise<Page<TaxonomyDto>> {
    return this.listOf(query);
  }

  @Post()
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Brend qo‘shish (§4.4)' })
  create(
    @Body(new ZodValidationPipe(createBrandSchema)) body: CreateBrandInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<TaxonomyDto> {
    return this.createOf(body.name, user, request);
  }

  /** Nom o‘zgarsa mahsulot nomlari ham qayta yig‘iladi (§4.6). */
  @Patch(':id')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Nomni o‘zgartirish yoki arxivlash' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBrandSchema)) body: UpdateBrandInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<TaxonomyDto> {
    return this.updateOf(id, body, user, request);
  }

  @Post(':id/merge')
  @Roles(UserRole.SHOP_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Boshqa brendga birlashtirish (§4.4)' })
  merge(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(mergeTaxonomySchema)) body: MergeTaxonomyInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<TaxonomyMergeResultDto> {
    return this.mergeOf(id, body, user, request);
  }
}
