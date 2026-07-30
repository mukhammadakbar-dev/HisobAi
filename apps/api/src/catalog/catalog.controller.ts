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
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { AuthGuard } from '../auth/auth.guard';
import { ProductDto } from '@baraka/contracts';

@ApiTags('Catalog')
@Controller('products')
@UseGuards(AuthGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post()
  @ApiOperation({ summary: 'Yangi mahsulot shablonini yaratish' })
  @ApiResponse({ status: 201, description: 'Mahsulot yaratildi' })
  async create(@Body() createProductDto: CreateProductDto): Promise<ProductDto> {
    return this.catalogService.create(createProductDto);
  }

  @Get()
  @ApiOperation({ summary: 'Barcha mahsulot shablonlarini olish' })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'brand', required: false })
  async findAll(
    @Query('category') category?: string,
    @Query('brand') brand?: string,
  ): Promise<ProductDto[]> {
    return this.catalogService.findAll(category, brand);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Mahsulot shablonini ID bo\'yicha olish' })
  async findOne(@Param('id') id: string): Promise<ProductDto> {
    return this.catalogService.findOne(id);
  }
}
