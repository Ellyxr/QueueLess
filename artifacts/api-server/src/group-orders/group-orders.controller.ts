import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateGroupOrderDto } from './dto/create-group-order.dto';
import { GroupOrdersService } from './group-orders.service';
import { AddGroupOrderItemDto } from './dto/add-group-order-item.dto';

@ApiTags('Group Orders')
@ApiBearerAuth()
@Controller('group-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GroupOrdersController {
  constructor(
    private readonly groupOrdersService: GroupOrdersService,
  ) {}

  @Post()
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Create a group order for a vendor',
  })
  @ApiResponse({
    status: 201,
    description:
      'Group order created and initiator joined successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Vendor is not active',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description: 'Vendor not found',
  })
  async createGroupOrder(
    @CurrentUser() user: { sub: string },
    @Body() dto: CreateGroupOrderDto,
  ) {
    return this.groupOrdersService.createGroupOrder(
      user.sub,
      dto,
    );
  }

  @Post(':groupOrderId/join')
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Join an open group order',
  })
  @ApiResponse({
    status: 201,
    description: 'Joined the group order successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Group order is no longer open',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description: 'Group order not found',
  })
  @ApiResponse({
    status: 409,
    description: 'User has already joined the group order',
  })
  async joinGroupOrder(
    @CurrentUser() user: { sub: string },
    @Param('groupOrderId') groupOrderId: string,
  ) {
    return this.groupOrdersService.joinGroupOrder(
      user.sub,
      groupOrderId,
    );
  }

    @Get(':groupOrderId')
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Get a group order as a joined participant',
  })
  @ApiResponse({
    status: 200,
    description: 'Group order retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden',
  })
  @ApiResponse({
    status: 404,
    description:
      'Group order not found or user is not a participant',
  })
  async getGroupOrder(
    @CurrentUser() user: { sub: string },
    @Param('groupOrderId') groupOrderId: string,
  ) {
    return this.groupOrdersService.getGroupOrder(
      user.sub,
      groupOrderId,
    );
  }

    @Patch(':groupOrderId/lock')
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Lock a group order',
  })
  @ApiResponse({
    status: 200,
    description: 'Group order locked successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Group order cannot be locked',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description:
      'Only the group order initiator can lock the group order',
  })
  @ApiResponse({
    status: 404,
    description: 'Group order not found',
  })
  async lockGroupOrder(
   @CurrentUser() user: { sub: string },
    @Param('groupOrderId') groupOrderId: string,
  ) {
    return this.groupOrdersService.lockGroupOrder(
      user.sub,
      groupOrderId,
    );
  }

  @Post(':groupOrderId/items')
@Roles('BUYER')
@ApiOperation({
  summary: 'Add an item to the current user group cart',
})
@ApiResponse({
  status: 201,
  description: 'Item added to group order successfully',
})
@ApiResponse({
  status: 400,
  description:
    'Group order is closed, vendor unavailable, or invalid product',
})
@ApiResponse({
  status: 403,
  description:
    'User is not a joined participant of the group order',
})
@ApiResponse({
  status: 404,
  description: 'Group order or product not found',
})
async addGroupOrderItem(
  @CurrentUser() user: { sub: string },
  @Param('groupOrderId') groupOrderId: string,
  @Body() dto: AddGroupOrderItemDto,
) {
  return this.groupOrdersService.addGroupOrderItem(
    user.sub,
    groupOrderId,
    dto,
  );
}

@Post(':groupOrderId/finalize')
@Roles('BUYER')
@ApiOperation({
  summary:
    'Finalize a locked group order into one authoritative order',
})
@ApiResponse({
  status: 201,
  description:
    'Group order finalized successfully',
})
@ApiResponse({
  status: 400,
  description:
    'Group order is not locked or contains invalid items',
})
@ApiResponse({
  status: 403,
  description:
    'Only the initiator can finalize the group order',
})
@ApiResponse({
  status: 404,
  description: 'Group order not found',
})
@ApiResponse({
  status: 409,
  description:
    'Group order is already finalized or changed concurrently',
})
async finalizeGroupOrder(
  @CurrentUser() user: { sub: string },
  @Param('groupOrderId') groupOrderId: string,
) {
  return this.groupOrdersService.finalizeGroupOrder(
    user.sub,
    groupOrderId,
  );
}
}
