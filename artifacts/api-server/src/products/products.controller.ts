import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProductSearchDto } from './dto/product-search.dto';
import { ProductsService } from './products.service';

@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search products by name',
  })
  @ApiQuery({
    name: 'category',
    required: false,
    type: String,
    description: 'Filter products by category',
  })
  @ApiQuery({
    name: 'vendorId',
    required: false,
    type: String,
    description: 'Filter products by vendor UUID',
  })
  async searchProducts(@Query() query: ProductSearchDto) {
    return this.productsService.searchProducts(query);
  }
}