import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { ProductSearchDto } from './dto/product-search.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async searchProducts(dto: ProductSearchDto) {
    const search = dto.search?.trim();
    const category = dto.category?.trim();

    return this.prisma.product.findMany({
      where: {
        isAvailable: true,

        ...(search
          ? {
              name: {
                contains: search,
                mode: 'insensitive',
              },
            }
          : {}),

        ...(category
          ? {
              category: {
                equals: category,
                mode: 'insensitive',
              },
            }
          : {}),

        ...(dto.vendorId
          ? {
              vendorId: dto.vendorId,
            }
          : {}),
      },

      select: {
        id: true,
        vendorId: true,
        name: true,
        description: true,
        price: true,
        category: true,
        isAvailable: true,
      },

      orderBy: {
        name: 'asc',
      },
    });
  }
}