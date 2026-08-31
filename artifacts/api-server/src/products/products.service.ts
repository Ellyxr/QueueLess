import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductSearchDto } from './dto/product-search.dto';
import { UpdateProductDto } from './dto/update-product.dto';

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

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        vendorId: true,
        name: true,
        description: true,
        price: true,
        category: true,
        isAvailable: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async getVendorForUser(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: {
        ownerUserId: userId,
      },
      select: {
        id: true,
      },
    });

    if (!vendor) {
      throw new ForbiddenException(
        'Authenticated user does not own a vendor account',
      );
    }

    return vendor;
  }

  async createProduct(userId: string, dto: CreateProductDto) {
    const vendor = await this.getVendorForUser(userId);

    const name = dto.name.trim();
    const description = dto.description?.trim() || null;
    const category = dto.category?.trim() || null;

    try {
      return await this.prisma.product.create({
        data: {
          vendorId: vendor.id,
          name,
          description,
          price: dto.price,
          category,
          isAvailable: dto.isAvailable ?? true,
        },
        select: {
          id: true,
          vendorId: true,
          name: true,
          description: true,
          price: true,
          category: true,
          isAvailable: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        throw new ConflictException(
          'A product with this name already exists for this vendor',
        );
      }

      throw error;
    }
  }

  async updateProduct(
    userId: string,
    productId: string,
    dto: UpdateProductDto,
  ) {
    const vendor = await this.getVendorForUser(userId);

    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
      select: {
        id: true,
        vendorId: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.vendorId !== vendor.id) {
      throw new ForbiddenException(
        'You do not have permission to modify this product',
      );
    }

    const data: {
      name?: string;
      description?: string | null;
      price?: number;
      category?: string | null;
      isAvailable?: boolean;
    } = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }

    if (dto.price !== undefined) {
      data.price = dto.price;
    }

    if (dto.category !== undefined) {
      data.category = dto.category.trim() || null;
    }

    if (dto.isAvailable !== undefined) {
      data.isAvailable = dto.isAvailable;
    }

    try {
      return await this.prisma.product.update({
        where: {
          id: productId,
        },
        data,
        select: {
          id: true,
          vendorId: true,
          name: true,
          description: true,
          price: true,
          category: true,
          isAvailable: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Unique constraint')
      ) {
        throw new ConflictException(
          'A product with this name already exists for this vendor',
        );
      }

      throw error;
    }
  }

  async deleteProduct(userId: string, productId: string) {
    const vendor = await this.getVendorForUser(userId);

    const product = await this.prisma.product.findUnique({
      where: {
        id: productId,
      },
      select: {
        id: true,
        vendorId: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.vendorId !== vendor.id) {
      throw new ForbiddenException(
        'You do not have permission to delete this product',
      );
    }

    await this.prisma.product.delete({
      where: {
        id: productId,
      },
    });

    return {
      message: 'Product deleted successfully',
    };
  }
}