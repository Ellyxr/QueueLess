import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import {
  AdminUserRoleDto,
  CreateAdminUserDto,
  UpdateAdminUserEmailDto,
  UpdateAdminUserPasswordDto,
  UpdateAdminUserRolesDto,
  UpdateAdminUserStatusDto,
} from './dto/admin-user.dto';

type AuthenticatedRequest = Request & {
  user: {
    sub: string;
  };
};

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  @ApiOperation({
    summary: 'Admin module placeholder',
  })
  getAdminRoot() {
    return {
      message: 'Admin module is available',
    };
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get admin dashboard metrics and recent activity',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin dashboard retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin role required',
  })
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  @ApiOperation({
    summary: 'List users for admin management',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search users by full name or email',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: AdminUserRoleDto,
    description: 'Filter users by active role',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication required',
  })
  @ApiResponse({
    status: 403,
    description: 'Admin role required',
  })
  listUsers(
    @Query('search') search?: string,
    @Query('role') role?: AdminUserRoleDto,
  ) {
    return this.adminService.listUsers(search, role);
  }

  @Post('users')
  @ApiOperation({
    summary: 'Create a user account as an administrator',
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Email or full name already exists',
  })
  createUser(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAdminUserDto,
  ) {
    return this.adminService.createUser(
      dto,
      request.user.sub,
    );
  }

  @Patch('users/:id/roles')
  @ApiOperation({
    summary: 'Update a user active roles',
  })
  @ApiResponse({
    status: 200,
    description: 'User roles updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  updateRoles(
    @Req() request: AuthenticatedRequest,
    @Param('id') userId: string,
    @Body() dto: UpdateAdminUserRolesDto,
  ) {
    return this.adminService.updateRoles(
      userId,
      dto,
      request.user.sub,
    );
  }

  @Patch('users/:id/status')
  @ApiOperation({
    summary: 'Update user active or archived status',
  })
  @ApiResponse({
    status: 200,
    description: 'User status updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  updateStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') userId: string,
    @Body() dto: UpdateAdminUserStatusDto,
  ) {
    return this.adminService.updateStatus(
      userId,
      dto,
      request.user.sub,
    );
  }

  @Patch('users/:id/email')
  @ApiOperation({
    summary: 'Change a user email after user consent',
  })
  @ApiResponse({
    status: 200,
    description: 'Email updated successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'User has not granted sensitive-data access',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Email already exists',
  })
  updateEmail(
    @Req() request: AuthenticatedRequest,
    @Param('id') userId: string,
    @Body() dto: UpdateAdminUserEmailDto,
  ) {
    return this.adminService.updateEmail(
      userId,
      dto,
      request.user.sub,
    );
  }

  @Patch('users/:id/password')
  @ApiOperation({
    summary: 'Set a new user password after user consent',
  })
  @ApiResponse({
    status: 200,
    description: 'Password updated successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'User has not granted sensitive-data access',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  updatePassword(
    @Req() request: AuthenticatedRequest,
    @Param('id') userId: string,
    @Body() dto: UpdateAdminUserPasswordDto,
  ) {
    return this.adminService.updatePassword(
      userId,
      dto,
      request.user.sub,
    );
  }
}
