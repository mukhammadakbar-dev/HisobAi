import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerDto, CustomerDetailDto } from '@baraka/contracts';
import { normalizePhoneE164 } from './utils/phone.util';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  private mapToDto(customer: any): CustomerDto {
    return {
      id: customer.id,
      fullName: customer.fullName,
      phoneE164: customer.phoneE164,
      address: customer.address,
      note: customer.note,
      totalDebt: 0, // Calculated dynamically when Installments module is built
      salesCount: customer.sales?.length || 0,
      activeContractsCount: customer.installmentContracts?.length || 0,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  async create(dto: CreateCustomerDto): Promise<CustomerDto> {
    const normalizedPhone = normalizePhoneE164(dto.phone);

    // Check duplicate phone
    const existing = await this.prisma.customer.findUnique({
      where: { phoneE164: normalizedPhone },
    });

    if (existing) {
      throw new ConflictException(
        `Ushbu telefon raqamli (${normalizedPhone}) mijoz allaqachon ro'yxatdan o'tgan`,
      );
    }

    const customer = await this.prisma.customer.create({
      data: {
        fullName: dto.fullName.trim(),
        phoneE164: normalizedPhone,
        address: dto.address?.trim() || null,
        note: dto.note?.trim() || null,
      },
    });

    return this.mapToDto(customer);
  }

  async findAll(search?: string): Promise<CustomerDto[]> {
    const where: any = {};

    if (search) {
      const q = search.trim();
      where.OR = [
        { fullName: { contains: q, mode: 'insensitive' } },
        { phoneE164: { contains: q, mode: 'insensitive' } },
      ];
    }

    const customers = await this.prisma.customer.findMany({
      where,
      include: {
        sales: true,
        installmentContracts: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return customers.map((c) => this.mapToDto(c));
  }

  async findOne(id: string): Promise<CustomerDetailDto> {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        sales: true,
        installmentContracts: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Mijoz topilmadi');
    }

    const baseDto = this.mapToDto(customer);

    return {
      ...baseDto,
      sales: customer.sales || [],
      payments: [],
      installmentContracts: customer.installmentContracts || [],
    };
  }
}
