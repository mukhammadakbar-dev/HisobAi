"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReceiveStockDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class ReceiveStockDto {
    productId;
    imei;
    serialNumber;
    costPrice;
    quantity;
    receivedAt;
}
exports.ReceiveStockDto = ReceiveStockDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'uuid-product-id', description: 'Mahsulot shabloni ID si' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Mahsulot tanlanishi shart' }),
    __metadata("design:type", String)
], ReceiveStockDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '864201061234567', description: 'IMEI raqami (seriyali mahsulot uchun)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveStockDto.prototype, "imei", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'C02G1234MD6R', description: 'Seriya raqami' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveStockDto.prototype, "serialNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 10500000, description: 'Kelish tannarxi (UZS)' }),
    (0, class_validator_1.IsNumber)({}, { message: 'Tannarx raqam bo\'lishi kerak' }),
    (0, class_validator_1.Min)(0, { message: 'Tannarx manfiy bo\'lishi mumkin emas' }),
    __metadata("design:type", Number)
], ReceiveStockDto.prototype, "costPrice", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 1, description: 'Miqdorli (aksessuar) mahsulotlar uchun miqdor' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ReceiveStockDto.prototype, "quantity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-07-30T15:00:00.000Z', description: 'Qabul qilingan vaqt' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], ReceiveStockDto.prototype, "receivedAt", void 0);
//# sourceMappingURL=receive-stock.dto.js.map