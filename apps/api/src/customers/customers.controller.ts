import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CustomerDto, CustomerDetailDto } from '@baraka/contracts';

@ApiTags('Customers')
@Controller('customers')
@UseGuards(AuthGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @ApiOperation({ summary: 'Yangi mijozni ro\'yxatdan o\'tkazish' })
  @ApiResponse({ status: 201, description: 'Mijoz muvaffaqiyatli yaratildi' })
  @ApiResponse({ status: 409, description: 'Telefon raqam dublikat' })
  async create(@Body() dto: CreateCustomerDto): Promise<CustomerDto> {
    return this.customersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Mijozlar ro\'yxatini olish va qidirish' })
  @ApiQuery({ name: 'search', required: false, description: 'Ism yoki telefon bo\'yicha qidiruv' })
  async findAll(@Query('search') search?: string): Promise<CustomerDto[]> {
    return this.customersService.findAll(search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Mijoz profilini va tafsilotlarini olish' })
  async findOne(@Param('id') id: string): Promise<CustomerDetailDto> {
    return this.customersService.findOne(id);
  }
}
