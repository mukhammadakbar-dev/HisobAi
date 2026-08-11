import {
  Body,
  Controller,
  Get,
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
  createProductSchema,
  productQuerySchema,
  updateProductSchema,
} from '@hisobai/contracts';
import type {
  CreateProductInput,
  Page,
  ProductDto,
  ProductQuery,
  UpdateProductInput,
} from '@hisobai/contracts';

import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { readPrecondition } from '../common/optimistic-lock';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProductService } from './product.service';

/**
 * Mahsulot shabloni (§4).
 *
 * `PERMISSIONS.md`: katalogni ko'rish hammaga, yaratish va tahrirlash
 * `OWNER`/`MANAGER` ga. MVP'da faqat `OWNER` mavjud (§16.14), shuning
 * uchun ikkala guruh ham hozir bitta rolni ko'rsatadi.
 */
@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductService) {}

  @Get()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Mahsulotlar ro‘yxati (qoldiq bilan)' })
  list(
    @Query(new ZodValidationPipe(productQuerySchema)) query: ProductQuery,
  ): Promise<Page<ProductDto>> {
    return this.products.list(query);
  }

  @Get(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Bitta mahsulot' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductDto> {
    return this.products.requireById(id);
  }

  @Post()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Mahsulot qo‘shish — nomi §4.6 bo‘yicha yig‘iladi' })
  create(
    @Body(new ZodValidationPipe(createProductSchema)) body: CreateProductInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<ProductDto> {
    return this.products.create(body, user, request.ip ?? null);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Tahrirlash yoki arxivlash (§4.8)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateProductSchema)) body: UpdateProductInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<ProductDto> {
    const precondition = readPrecondition(request, body.expectedUpdatedAt);
    return this.products.update(id, body, precondition, user, request.ip ?? null);
  }
}
