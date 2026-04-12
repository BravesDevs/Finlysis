import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsDateString,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'MatchPassword', async: false })
class MatchPasswordConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: string, args: ValidationArguments): boolean {
    const dto = args.object as RegisterDto;
    return dto.password === confirmPassword;
  }

  defaultMessage(): string {
    return 'confirmPassword must match password';
  }
}

export class RegisterDto {
  @ApiProperty({ example: 'liam.tremblay@example.ca', description: 'Unique email address' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password@123', minLength: 8, description: 'Must be at least 8 characters' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Password@123', description: 'Must match password' })
  @IsString()
  @IsNotEmpty()
  @Validate(MatchPasswordConstraint)
  confirmPassword: string;

  @ApiProperty({ example: 'Liam' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Tremblay' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ example: '+14161234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '1990-06-15', description: 'ISO 8601 date string' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'uuid-of-cad-currency', description: 'UUID of preferred Currency row' })
  @IsOptional()
  @IsUUID()
  preferredCurrencyId?: string;
}
