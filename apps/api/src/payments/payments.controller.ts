import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import {
  AdminProfile,
  PaymentDto,
  InstallmentContractDto,
  InstallmentStatus,
} from '@baraka/contracts';

@ApiTags('Payments & Installments')
@Controller()
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments')
  @ApiOperation({ summary: 'Nasiya shartnomasiga yangi to\'lov kiritish' })
  async createPayment(
    @Body() dto: CreatePaymentDto,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<PaymentDto> {
    return this.paymentsService.createPayment(dto, admin.id);
  }

  @Post('payments/:id/confirm')
  @ApiOperation({ summary: 'Karta o\'tkazmasi to\'lovini tasdiqlash' })
  async confirmPayment(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<PaymentDto> {
    return this.paymentsService.confirmPayment(id, admin.id);
  }

  @Post('payments/:id/reject')
  @ApiOperation({ summary: 'Karta o\'tkazmasi to\'lovini rad etish' })
  async rejectPayment(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<PaymentDto> {
    return this.paymentsService.rejectPayment(id, admin.id);
  }

  @Post('payments/:id/reverse')
  @ApiOperation({ summary: 'Tasdiqlangan to\'lovni bekor qilish / qaytarish' })
  async reversePayment(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<PaymentDto> {
    return this.paymentsService.reversePayment(id, admin.id);
  }

  @Get('payments/pending')
  @ApiOperation({ summary: 'Tekshiruv kutilayotgan karta to\'lovlari ro\'yxati' })
  async getPendingPayments(): Promise<PaymentDto[]> {
    return this.paymentsService.getPendingPayments();
  }

  @Get('installments')
  @ApiOperation({ summary: 'Nasiya shartnomalari ro\'yxati' })
  @ApiQuery({ name: 'status', required: false, enum: InstallmentStatus })
  @ApiQuery({ name: 'customerId', required: false })
  async getContracts(
    @Query('status') status?: InstallmentStatus,
    @Query('customerId') customerId?: string,
  ): Promise<InstallmentContractDto[]> {
    return this.paymentsService.getContracts(status, customerId);
  }

  @Get('installments/:contractId')
  @ApiOperation({ summary: 'Bitta nasiya shartnomasi va uning to\'lovlar tarixi hamda grafigi' })
  async getContract(
    @Param('contractId') contractId: string,
  ): Promise<InstallmentContractDto> {
    return this.paymentsService.getContract(contractId);
  }

  @Patch('installments/:contractId/schedule')
  @ApiOperation({ summary: 'Nasiya to\'lov jadvalini tahrirlash (to\'lov kiritilishidan oldin)' })
  async updateSchedule(
    @Param('contractId') contractId: string,
    @Body() dto: UpdateScheduleDto,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<InstallmentContractDto> {
    return this.paymentsService.updateSchedule(contractId, dto, admin.id);
  }
}
