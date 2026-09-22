import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductSearchDto } from './dto/product-search.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const PRODUCT_SELECT = {
  id: true,
  vendorId: true,
  name: true,
  description: true,
  price: true,
  preparationTimeMinutes: true,
  category: true,
  isAvailable: true,
  imageUrl: true,
  imageFileId: true,
  createdAt: true,
  updatedAt: true,
  eligibleExtras: {
    select: {
      id: true,
      name: true,
      price: true,
      description: true,
      category: true,
    },
  },
} as const;

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
        preparationTimeMinutes: true,
        category: true,
        isAvailable: true,
        imageUrl: true,
        imageFileId: true,
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
        preparationTimeMinutes: true,
        category: true,
        isAvailable: true,
        imageUrl: true,
        imageFileId: true,
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

  /** Extras can only be marked eligible for a product if they belong to the same vendor. */
  private async validateEligibleExtraIds(
    vendorId: string,
    extraIds: string[],
    excludeProductId?: string,
  ) {
    const uniqueIds = [...new Set(extraIds)];
    if (uniqueIds.length === 0) return uniqueIds;

    if (excludeProductId && uniqueIds.includes(excludeProductId)) {
      throw new BadRequestException('A product cannot be its own extra');
    }

    const owned = await this.prisma.product.findMany({
      where: {
        id: { in: uniqueIds },
        vendorId,
      },
      select: { id: true },
    });

    if (owned.length !== uniqueIds.length) {
      throw new BadRequestException(
        'One or more eligibleExtraIds do not belong to this vendor',
      );
    }

    return uniqueIds;
  }

  async createProduct(userId: string, dto: CreateProductDto) {
    const vendor = await this.getVendorForUser(userId);

    const name = dto.name.trim();
    const description = dto.description?.trim() || null;
    const category = dto.category?.trim() || null;
    const eligibleExtraIds = dto.eligibleExtraIds
      ? await this.validateEligibleExtraIds(vendor.id, dto.eligibleExtraIds)
      : [];

    try {
      return await this.prisma.product.create({
        data: {
          vendorId: vendor.id,
          name,
          description,
          price: dto.price,
          preparationTimeMinutes: dto.preparationTimeMinutes ?? 15,
          category,
          isAvailable: dto.isAvailable ?? true,
          imageUrl: dto.imageUrl?.trim() || null,
          imageFileId: dto.imageFileId?.trim() || null,
          ...(eligibleExtraIds.length > 0
            ? { eligibleExtras: { connect: eligibleExtraIds.map((id) => ({ id })) } }
            : {}),
        },
        select: PRODUCT_SELECT,
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

    const data: Prisma.ProductUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }

    if (dto.price !== undefined) {
      data.price = dto.price;
    }

    if (dto.preparationTimeMinutes !== undefined) {
      data.preparationTimeMinutes =
        dto.preparationTimeMinutes;
    }

    if (dto.category !== undefined) {
      data.category = dto.category.trim() || null;
    }

    if (dto.isAvailable !== undefined) {
      data.isAvailable = dto.isAvailable;
    }

     if (dto.imageUrl !== undefined) {
      data.imageUrl = dto.imageUrl.trim() || null;
    }

    if (dto.imageFileId !== undefined) {
      data.imageFileId = dto.imageFileId.trim() || null;
    }

    if (dto.eligibleExtraIds !== undefined) {
      const eligibleExtraIds = await this.validateEligibleExtraIds(
        vendor.id,
        dto.eligibleExtraIds,
        productId,
      );
      data.eligibleExtras = {
        set: eligibleExtraIds.map((id) => ({ id })),
      };
    }

    try {
      return await this.prisma.product.update({
        where: {
          id: productId,
        },
        data,
        select: PRODUCT_SELECT,
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
