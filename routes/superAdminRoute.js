import exress from 'express'
import { createAdmin, createSuperAdmin, loginSuperAdmin } from '../controllres/superAdminController'

const superAdminRoute = exress.Router()

superAdminRoute.post('/create',createSuperAdmin)
superAdminRoute.post('/login',loginSuperAdmin)
superAdminRoute.post('/create-admin',createAdmin)

export { superAdminRoute}