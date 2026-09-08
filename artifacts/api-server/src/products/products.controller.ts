import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt.strategy';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductSearchDto } from './dto/product-search.dto';
import { UpdateProductDto } from './dto/update-product.dto';
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

  @Get(':id')
  async getProduct(@Param('id') id: string) {
    return this.productsService.getProduct(id);
  }

  @Post()
  @Roles('VENDOR_OWNER')
  @UseGuards(RolesGuard)
  async createProduct(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createProduct(user.sub, dto);
  }

  @Patch(':id')
  @Roles('VENDOR_OWNER')
  @UseGuards(RolesGuard)
  async updateProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.updateProduct(user.sub, id, dto);
  }

  @Delete(':id')
  @Roles('VENDOR_OWNER')
  @UseGuards(RolesGuard)
  async deleteProduct(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.productsService.deleteProduct(user.sub, id);
  }
}