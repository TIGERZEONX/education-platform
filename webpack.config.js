const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const commonRules = [
  {
    test: /\.tsx?$/,
    use: 'ts-loader',
    exclude: /node_modules/,
  },
  {
    test: /\.css$/i,
    use: ['style-loader', 'css-loader'],
  },
];

const webConfig = {
  mode: 'development',
  entry: {
    student: './frontend/student-client/src/app/index.tsx',
    teacher: './frontend/teacher-dashboard/src/app/index.tsx',
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
  },
  module: { rules: commonRules },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'CognitivePulse - Student Client',
      filename: 'student.html',
      chunks: ['student'],
      templateContent: `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <title>CognitivePulse - Student</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <div id="root"></div>
          </body>
        </html>
      `
    }),
    new HtmlWebpackPlugin({
      title: 'CognitivePulse - Teacher Dashboard',
      filename: 'teacher.html',
      chunks: ['teacher'],
      templateContent: `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <title>CognitivePulse - Teacher</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            <div id="root"></div>
          </body>
        </html>
      `
    }),
  ],
  devServer: {
    static: './dist',
    port: 3000,
    open: ['/student.html', '/teacher.html'],
  },
};

const extensionConfig = {
  mode: 'development',
  devtool: false, // Prevents Webpack from using unsafe-eval source maps
  entry: {
    content: './frontend/extension/src/content.tsx',
    background: './frontend/extension/src/background.ts'
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'frontend/extension/dist'),
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
  },
  module: { rules: commonRules },
};

module.exports = [webConfig, extensionConfig];
