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
  createCustomerSchema,
  customerQuerySchema,
  updateCustomerSchema,
} from '@hisobai/contracts';
import type {
  CreateCustomerInput,
  CustomerDto,
  CustomerQuery,
  CustomerSummaryDto,
  Page,
  UpdateCustomerInput,
} from '@hisobai/contracts';

import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { readPrecondition } from '../common/optimistic-lock';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CustomersService } from './customers.service';

/**
 * Mijozlar (§6).
 *
 * `GET /customers/:id/history` (ARCHITECTURE §) hozircha **yo'q**:
 * u savdo va to'lovlardan iborat, ular esa 5- va 7-bosqichda keladi.
 * Bo'sh tarix qaytaradigan endpoint "savdo yo'q" degan yolg'on
 * xulosaga asos berardi.
 */
@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Mijozlar ro‘yxati — ism va telefon bo‘yicha qidiruv (§6.4)' })
  list(
    @Query(new ZodValidationPipe(customerQuerySchema)) query: CustomerQuery,
  ): Promise<Page<CustomerSummaryDto>> {
    return this.customers.list(query);
  }

  /**
   * Passport ma'lumoti faqat shu javobda bo'ladi, ro'yxatda emas — va
   * u yerda ham rolga qarab kesiladi (`PERMISSIONS.md` §1).
   */
  @Get(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Mijoz kartasi' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<CustomerDto> {
    return this.customers.requireById(id, user);
  }

  @Post()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Mijoz qo‘shish — telefon E.164 ga keltiriladi (§6.2)' })
  create(
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<CustomerDto> {
    return this.customers.create(body, user, request.ip ?? null);
  }

  @Patch(':id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Tahrirlash, belgilash (§6.9) yoki arxivlash (§6.13)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<CustomerDto> {
    const precondition = readPrecondition(request, body.expectedUpdatedAt);
    return this.customers.update(id, body, precondition, user, request.ip ?? null);
  }
}
