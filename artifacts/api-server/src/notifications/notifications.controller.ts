import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  listMine(@CurrentUser() user: { sub: string }) {
    return this.notificationsService.listMine(user.sub);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() user: { sub: string }) {
    return this.notificationsService.getUnreadCount(user.sub);
  }

  @Patch(':id/read')
  markRead(
    @CurrentUser() user: { sub: string },
    @Param('id') id: string,
  ) {
    return this.notificationsService.markRead(user.sub, id);
  }
}
