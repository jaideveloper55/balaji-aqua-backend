import { PartialType } from '@nestjs/swagger';
import { CreateVendorDto } from './Create vendor.dto';
export class UpdateVendorDto extends PartialType(CreateVendorDto) {}
