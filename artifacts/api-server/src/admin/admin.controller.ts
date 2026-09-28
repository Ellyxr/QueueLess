import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
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
import { ListAdminVendorsDto, UpdateAdminVendorStatusDto } from './dto/admin-vendor.dto';
import { PasabuyIdentityService } from '../pasabuy/pasabuy-identity.service';
import { ReviewStudentIdDto } from '../pasabuy/dto/review-student-id.dto';

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
  constructor(private readonly adminService: AdminService,
    private readonly pasabuyIdentity: PasabuyIdentityService) {}

  @Get('pasabuy/student-ids')
  @ApiOperation({ summary: 'Review private student ID submissions' })
  pendingPasabuyStudentIds() {
    return this.pasabuyIdentity.pendingReviews();
  }

  @Get('pasabuy/student-ids/:userId/photo')
  @ApiOperation({ summary: 'Get a short-lived private ID photo link as an admin' })
  pasabuyStudentIdPhoto(@Param('userId') userId: string) {
    return this.pasabuyIdentity.reviewPhoto(userId);
  }

  @Patch('pasabuy/student-ids/:userId')
  @ApiOperation({ summary: 'Approve or reject a submitted student ID' })
  reviewPasabuyStudentId(@Req() request: AuthenticatedRequest,
    @Param('userId') userId: string, @Body() dto: ReviewStudentIdDto) {
    return this.pasabuyIdentity.review(userId, dto.decision, request.user.sub);
  }

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

  @Get('vendors')
  @ApiOperation({ summary: 'List vendors, including pending and suspended stores' })
  listVendors(@Query() query: ListAdminVendorsDto) {
    return this.adminService.listVendors(query);
  }

  @Get('vendors/:id')
  @ApiOperation({ summary: 'Get a vendor for admin management' })
  getVendor(@Param('id', ParseUUIDPipe) vendorId: string) {
    return this.adminService.getVendor(vendorId);
  }

  @Get('vendors/:id/audit')
  @ApiOperation({ summary: 'Get the vendor participation audit history' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  getVendorAudit(
    @Param('id', ParseUUIDPipe) vendorId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getVendorAudit(vendorId, page, limit);
  }

  @Patch('vendors/:id/status')
  @ApiOperation({ summary: 'Approve, suspend, or reactivate a vendor' })
  updateVendorStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) vendorId: string,
    @Body() dto: UpdateAdminVendorStatusDto,
  ) {
    return this.adminService.updateVendorStatus(
      vendorId,
      dto.status,
      request.user.sub,
      dto.reason,
    );
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

  @Get('users/:id')
  @ApiOperation({ summary: 'Get one user for admin management' })
  getUser(@Param('id', ParseUUIDPipe) userId: string) {
    return this.adminService.getUser(userId);
  }

  @Get('users/:id/audit')
  @ApiOperation({ summary: 'Get the user management audit history' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  getUserAudit(
    @Param('id', ParseUUIDPipe) userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getUserAudit(userId, page, limit);
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
    @Param('id', ParseUUIDPipe) userId: string,
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
    @Param('id', ParseUUIDPipe) userId: string,
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
    @Param('id', ParseUUIDPipe) userId: string,
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
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateAdminUserPasswordDto,
  ) {
    return this.adminService.updatePassword(
      userId,
      dto,
      request.user.sub,
    );
  }
}
