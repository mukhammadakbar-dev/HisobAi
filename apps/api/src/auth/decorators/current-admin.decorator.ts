import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminProfile } from '@baraka/contracts';

export const CurrentAdmin = createParamDecorator(
  (data: keyof AdminProfile | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const admin = request.admin as AdminProfile;

    if (!admin) {
      return null;
    }

    return data ? admin[data] : admin;
  },
);
