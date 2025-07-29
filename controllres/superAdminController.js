import bcrypt from 'bcryptjs';
import SuperAdmin from '../models/superAdminModel/superAdminModel.js';
import User from '../models/user/userModel.js';

export const createSuperAdmin = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const exist = await SuperAdmin.findOne({ email });
    if (exist) {
      return res.json({ success: false, message: 'Super admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const superAdmin = await SuperAdmin.create({
      email,
      password: hashedPassword,
      name,
    });

    return res.json({ success: true, message: 'Super admin created', data: superAdmin });
  } catch (err) {
    return res.json({ success: false, message: 'Error creating super admin' });
  }
};

export const loginSuperAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await SuperAdmin.findOne({ email });
    if (!admin) {
      return res.json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.json({ success: false, message: 'Invalid password' });
    }

    const token = jwt.sign({ id: admin._id, role: admin.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    return res.json({ success: true, message: 'Login successful', data:{ admin:admin,token:token }});
  } catch (err) {
    return res.json({ success: false, message: 'Login failed' });
  }
};

export const createAdmin = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const exist = await User.findOne({ email });
    if (exist) {
      return res.json({ success: false, message: 'Admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.create({
      email,
      password: hashedPassword,
      name,
      role: 'admin'
    });

    return res.json({ success: true, message: 'Admin created', data: admin });
  } catch (err) {
    return res.json({ success: false, message: 'Failed to create admin' });
  }
};