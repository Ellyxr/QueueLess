import React, { useState } from "react";
import { RegisterInput } from "../../types/auth";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../../components/ui/card";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Eye, EyeOff } from "lucide-react";

interface RegisterFormProps {
  onSubmit: (data: RegisterInput) => Promise<void>;
}

type UserRole = "student" | "vendor";

export const RegisterForm: React.FC<RegisterFormProps> = ({ onSubmit }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);

  // Form states
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Function para i-reset ang lahat ng form inputs
  const resetForm = () => {
    setFullName("");
    setEmail("");
    setPhoneNumber("");
    setPassword("");
    setConfirmPassword("");
    setBusinessName("");
    setErrorMessage("");
  };

  // Gamitin ito kapag nagpi-pili ng Role:
  const handleSelectRole = (role: "student" | "vendor") => {
    resetForm();
    setSelectedRole(role);
  };

  // Gamitin din sa Back Button:
  const handleBack = () => {
    resetForm();
    setSelectedRole(null);
  };

  // Password Visibility States
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // live preview of phonenumber characters
  const phoneNumberCounter = phoneNumber.length <= 9 && phoneNumber.length > 7;

  // Live Password Match Check (only shows if user has typed in confirmPassword)
  const isPasswordMismatch =
    confirmPassword.length > 0 && password !== confirmPassword;

  //check if it's student email
  const isDomainInvalid =
    email.length > 0 &&
    (selectedRole === "vendor"
      ? !email.endsWith("@gmail.com") &&
        !email.endsWith("@yahoo.com") &&
        !email.endsWith("@hotmail.com")
      : !email.endsWith("@students.nu-laguna.edu.ph"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!selectedRole) return;

    if (!fullName || !email || !phoneNumber || !password || !confirmPassword) {
      setErrorMessage("Please fill in all required fields.");
      return;
    }

    // Student Email Validation Check
    if (selectedRole === "student") {
      const studentDomain = "@students.nu-laguna.edu.ph";
      if (!email.toLowerCase().endsWith(studentDomain)) {
        setErrorMessage(`Student email must end with ${studentDomain}`);
        return;
      }
    }

    if (selectedRole === "vendor" && !businessName) {
      setErrorMessage("Business / Stall Name is required.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (phoneNumberCounter) {
      setErrorMessage("Phone number must be 10 digits.");
      return;
    }

    try {
      setIsLoading(true);
      await onSubmit({
        fullName,
        email,
        phoneNumber,
        password,
        confirmPassword,
        role: selectedRole,
        businessName: selectedRole === "vendor" ? businessName : undefined,
      });
    } catch (err: any) {
      setErrorMessage(err.message || "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // STEP 1: Card Selection View
  if (!selectedRole) {
    return (
      <div className="w-full flex flex-col justify-start items-center pt-3 pb-6 px-4 -mt-10">
        <div className="w-full max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-3xl font-bold text-center mb-6 text-gray-800 dark:text-slate-100">
            Register as
          </h2>

          {/* Two Role Options: Student & External Vendor */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Student Card */}
            <Card
              className="p-8 cursor-pointer hover:border-[#005691] hover:shadow-lg transition-all border-2 text-center flex flex-col justify-center items-center h-48 bg-white dark:bg-slate-900 rounded-xl"
              onClick={() => handleSelectRole("student")}
            >
              <CardTitle className="text-xl font-bold mb-2 text-gray-900 dark:text-slate-100">
                Student
              </CardTitle>
              <CardDescription className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-sm">
                Register as a student buyer using your official NU Laguna email
                address.
              </CardDescription>
            </Card>

            {/* External Vendor Card */}
            <Card
              className="p-8 cursor-pointer hover:border-[#005691] hover:shadow-lg transition-all border-2 text-center flex flex-col justify-center items-center h-48 bg-white dark:bg-slate-900 rounded-xl"
              onClick={() => handleSelectRole("vendor")}
            >
              <CardTitle className="text-xl font-bold mb-2 text-gray-900 dark:text-slate-100">
                External Vendor
              </CardTitle>
              <CardDescription className="text-xs text-gray-500 dark:text-slate-400 leading-relaxed max-w-sm">
                Partner with QueueLess to list your menu and manage campus
                orders seamlessly.
              </CardDescription>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: Registration Form View
  const roleTitles = {
    student: "Student Registration",
    vendor: "External Vendor Registration",
  };

  return (
    <Card className="w-full max-w-lg mx-auto bg-white/20 dark:bg-slate-900/30 backdrop-blur-xl border border-white/30 dark:border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.25)] rounded-2xl p-6">
      <CardHeader className="p-0 pb-6 space-y-4">
        {/* Top Action Bar: Back Button */}
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-slate-200 bg-white/40 dark:bg-slate-800/40 hover:bg-white/70 dark:hover:bg-slate-800/80 border border-white/30 dark:border-white/10 backdrop-blur-md rounded-xl transition-all shadow-sm"
          >
            <span className="text-sm font-bold">←</span> Back
          </button>
        </div>

        {/* Main Form Title & Subtitle */}
        <div className="text-center space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight">
            {roleTitles[selectedRole]}
          </CardTitle>
          <CardDescription className="text-xs text-gray-500 dark:text-slate-400">
            Enter your details below to create your account
          </CardDescription>
        </div>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4 p-0">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">
                {errorMessage}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-xs font-semibold">
              Full Name
            </Label>
            <div className="rounded-md border border-white/20 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm focus-within:ring-2 focus-within:ring-[#005691] focus-within:bg-white/60 transition-all focus:border-none">
              {" "}
              <Input
                id="fullName"
                placeholder="Juan Dela Cruz"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-semibold">
              Email Address
            </Label>

            <div
              className={`rounded-md border bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm focus-within:ring-2 focus-within:ring-[#005691] focus-within:bg-white/60 transition-all focus:border-none
    ${
      isDomainInvalid
        ? "border-red-500 focus-within:ring-red-500"
        : "border-white/20 dark:border-white/10"
    }`}
            >
              <Input
                id="email"
                type="email"
                placeholder={
                  selectedRole === "vendor"
                    ? "vendor@gmail.com"
                    : "student@students.nu-laguna.edu.ph"
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
              />
            </div>

            {/* Dynamic Error Message */}
            {isDomainInvalid && (
              <p className="text-[11px] font-medium text-red-500 animate-in fade-in-50 duration-200">
                Please use your{" "}
                {selectedRole === "vendor"
                  ? "Gmail account"
                  : "NU Laguna student email"}
                .
              </p>
            )}
          </div>

          {/* Phone Number Field with +63 Prefix Badge */}
          <div className="space-y-1.5">
            <Label htmlFor="phoneNumber" className="text-xs font-semibold">
              Phone Number
            </Label>
            <div className="relative flex items-center rounded-md border border-white/20 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm focus-within:ring-2 focus-within:ring-[#005691] focus-within:bg-white/60 transition-all overflow-hidden">
              {/* Permanent Country Code Prefix Badge */}
              <span className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 bg-black/5 dark:bg-white/10 border-r border-white/20 dark:border-white/10 select-none flex items-center justify-center">
                +63
              </span>

              {/* Clean Number Input */}
              <Input
                id="phoneNumber"
                type="tel"
                required
                maxLength={10}
                value={phoneNumber}
                onChange={(e) => {
                  const onlyNums = e.target.value.replace(/\D/g, "");
                  setPhoneNumber(onlyNums);
                }}
                placeholder="XXX-XXX-XXXX"
                disabled={isLoading}
                className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-xs px-3 h-9"
              />
            </div>
            {/* Live Preview Text Warning */}
            {phoneNumberCounter && (
              <p className="text-[11px] text-yellow-500 font-medium mt-1">
                Phone number must be 10 digits.
              </p>
            )}
          </div>

          {selectedRole === "vendor" && (
            <div className="space-y-2">
              <Label htmlFor="businessName" className="text-xs font-semibold">
                Business / Stall Name
              </Label>
              <div className="rounded-md border border-white/20 bg-white/40 backdrop-blur-sm">
                <Input
                  id="businessName"
                  type="text"
                  placeholder="e.g. Juan's Food Stall"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          {/* Password with Eye Toggle */}
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-semibold ">
              Password
            </Label>
            <div className="relative rounded-md border border-white/20 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm focus-within:ring-2 focus-within:ring-[#005691] focus-within:bg-white/60 transition-all">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="pr-10  "
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Confirm Password with Eye Toggle & Live Feedback */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-xs font-semibold">
              Confirm Password
            </Label>
            <div className="relative rounded-md border border-white/20 dark:border-white/10 bg-white/40 dark:bg-slate-800/40 backdrop-blur-sm focus-within:ring-2 focus-within:ring-[#005691] focus-within:bg-white/60 transition-all focus:border-none">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                className={`pr-10 ${isPasswordMismatch ? "border-red-500 focus-visible:ring-red-500" : ""}`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Live Preview Text Warning */}
            {isPasswordMismatch && (
              <p className="text-[11px] text-red-500 font-medium mt-1">
                Passwords do not match
              </p>
            )}
            {confirmPassword.length > 0 && !isPasswordMismatch && (
              <p className="text-[11px] text-emerald-600 font-medium mt-1">
                Passwords match ✓
              </p>
            )}
          </div>
        </CardContent>

        <CardFooter className="px-0 pt-6">
          <Button
            type="submit"
            className="w-full bg-[#005691] hover:bg-[#00406c]"
            disabled={isLoading || isPasswordMismatch}
          >
            {isLoading ? "Registering..." : "Register"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
};
