'use client'

import React, { useState, useEffect, useRef, useCallback, MouseEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertCircle, BookOpen, BookMarked, Trash2, Plus, Check, LayoutDashboard } from 'lucide-react';
import Image from 'next/image';

const DegreeProposal = () => {
  // Add tab state
  const [activeTab, setActiveTab] = useState('builder');

  // Add session state
  const [sessionId, setSessionId] = useState(() => {
    if (typeof window !== 'undefined') {
      // Extract from URL or generate new
      const params = new URLSearchParams(window.location.search);
      return params.get('session') || null;
    }
    return null;
  });

  // Initialize state with just ISCI discipline
  const [disciplines, setDisciplines] = useState({ ISCI: [] });
  const [newDiscipline, setNewDiscipline] = useState('');
  const [newCourse, setNewCourse] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState('');
  const [validationResults, setValidationResults] = useState(null);
  const [error, setError] = useState('');
  const [courseSearchResults, setCourseSearchResults] = useState([]);
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseTitles, setCourseTitles] = useState({});
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showStartupMessage, setShowStartupMessage] = useState(false);
  const [stream, setStream] = useState('regular');
  const [disciplineOrder, setDisciplineOrder] = useState(['ISCI']);

  // Add this near the top of your DegreeProposal component
  const getBaseUrl = () => {
    // Check if running in development mode
    if (process.env.NODE_ENV === 'development') {
      return 'http://127.0.0.1:5000';
    }
    // Production URL
    return 'https://iscidegreeproposal.onrender.com';
  };

  // Update URL with session ID without page reload
  const updateUrlWithSession = useCallback((sid) => {
    if (typeof window !== 'undefined' && sid) {
      const url = new URL(window.location.href);
      url.searchParams.set('session', sid);
      window.history.replaceState({}, '', url);
    }
  }, []);

  // Create a helper function for API calls to handle session
  const makeApiCall = async (endpoint, method, body = null) => {
    const baseUrl = getBaseUrl();
    const url = new URL(`${baseUrl}${endpoint}`);

    // Add session ID to URL if available
    if (sessionId) {
      url.searchParams.set('session', sessionId);
    }

    const response = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();

    // Update session ID if provided in response
    if (data.session_id && data.session_id !== sessionId) {
      setSessionId(data.session_id);
      updateUrlWithSession(data.session_id);
    }

    return data;
  };

  // Reset the proposal when the page loads
  useEffect(() => {
    const initializeProposal = async () => {
      try {
        if (!sessionId) {
          // Only reset if there's no session ID (new user)
          const data = await makeApiCall('/reset', 'POST');
          if (data.success) {
            fetchValidation();
            setStream('regular');
            setDisciplines({ ISCI: [] });
            setDisciplineOrder(['ISCI']);  // Reset order
          }
        } else {
          // Fetch the complete state for existing session
          const stateData = await makeApiCall('/proposal-state', 'GET');
          if (stateData.disciplines) {
            setDisciplines(stateData.disciplines);
            
            // Set discipline order from saved state
            if (stateData.discipline_order) {
              setDisciplineOrder(stateData.discipline_order);
            } else {
              // Fallback: ensure ISCI is first
              const keys = Object.keys(stateData.disciplines);
              setDisciplineOrder(['ISCI', ...keys.filter(k => k !== 'ISCI')]);
            }
            
            // Set stream from saved state
            if (stateData.stream) {
              setStream(stateData.stream);
            }
            
            // Fetch course titles for all existing courses
            const allCourses = Object.values(stateData.disciplines).flat();
            if (allCourses.length > 0) {
              await fetchCourseTitles(allCourses);
            }
          }
          
          // Also fetch validation data
          fetchValidation();
        }
      } catch (error) {
        console.error('Error initializing proposal:', error);
      }
    };

    initializeProposal();
    
    // Add click outside listener for dropdown
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCourseDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside as EventListener);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside as EventListener);
    };
  }, [sessionId]); // Add sessionId as dependency

  // Add this helper function
  const fetchCourseTitles = async (courseCodes) => {
    // Create a series of promises to fetch course data in parallel
    const promises = courseCodes.map(async (code) => {
      try {
        // Search for the specific course to get its title
        const data = await makeApiCall(`/search-courses?query=${encodeURIComponent(code)}`, 'GET');
        const course = data.results?.find(c => c.code === code);
        if (course) {
          return { code, title: course.name };
        }
      } catch (err) {
        console.error(`Failed to fetch course title for ${code}:`, err);
      }
      return null;
    });
  
    // Wait for all promises to resolve
    const results = await Promise.all(promises);
    
    // Update course titles
    const newTitles = {};
    results.filter(Boolean).forEach(item => {
      if (item) newTitles[item.code] = item.title;
    });
    
    setCourseTitles(prev => ({ ...prev, ...newTitles }));
  };

  // Update all API functions to use makeApiCall
  const fetchValidation = async () => {
    try {
      const data = await makeApiCall('/validate', 'GET');
      setValidationResults(data);
    } catch (err) {
      console.error('Failed to fetch validation:', err);
    }
  };

  const addDiscipline = async () => {
    if (!newDiscipline.trim()) {
      setError('Please enter a discipline name');
      return;
    }
  
    try {
      const data = await makeApiCall('/disciplines', 'POST', { 
        discipline_name: newDiscipline 
      });
      
      if (data.success) {
        setDisciplines(prev => ({ ...prev, [newDiscipline]: [] }));
        setDisciplineOrder(prev => [...prev, newDiscipline]);  // Add to order
        setNewDiscipline('');
        setError('');
        
        if (data.validation) {
          setValidationResults(data.validation);
        }
      } else {
        setError(data.message || 'Failed to add discipline');
      }
    } catch (_) {
      setError('Failed to add discipline');
    }
  };
  
  const removeDiscipline = async (disciplineName) => {
    if (disciplineName === 'ISCI') {
      setError('Cannot remove ISCI discipline');
      return;
    }
  
    try {
      const data = await makeApiCall(`/disciplines/${encodeURIComponent(disciplineName)}`, 'DELETE');
      
      if (data.success) {
        const newDisciplines = { ...disciplines };
        delete newDisciplines[disciplineName];
        setDisciplines(newDisciplines);
        setDisciplineOrder(prev => prev.filter(d => d !== disciplineName));  // Remove from order
        setError('');
  
        if (data.validation) {
          setValidationResults(data.validation);
        }
      } else {
        setError(data.message || 'Unknown error');
      }
    } catch (err) {
      setError(`Failed to remove ${disciplineName}`);
    }
  };

  const addCourse = async (disciplineName, courseCode) => {
    if (!disciplineName || !courseCode.trim()) {
      setDisciplineError(disciplineName, 'Please enter a course code');
      return;
    }

    // Check for restricted courses
    const restrictedCourses = ['PATH 437', 'MICB 406', 'MICB 407'];
    if (restrictedCourses.includes(courseCode.toUpperCase())) {
      setDisciplineError(disciplineName, 'This course is not available to Integrated Science Students, see proposal guidelines');
      return;
    }

    try {
      const data = await makeApiCall('/courses', 'POST', {
        discipline_name: disciplineName,
        course_code: courseCode,
      });

      if (data.success) {
        setDisciplines(prev => ({
          ...prev,
          [disciplineName]: [...prev[disciplineName], courseCode],
        }));
        setCourseTitles(prev => ({
          ...prev,
          [courseCode]: data.course.title
        }));
        
        // Clear any existing error for this discipline
        clearDisciplineError(disciplineName);
        setError(''); // Clear global error too

        if (data.validation) {
          setValidationResults(data.validation);
        }
      } else {
        // Set error specific to this discipline
        setDisciplineError(disciplineName, data.message || 'Course not found or already added');
      }
    } catch (_) {
      setDisciplineError(disciplineName, 'Failed to add course');
    }
  };

  const removeCourse = async (disciplineName, courseCode) => {
    try {
      const data = await makeApiCall('/courses', 'DELETE', {
        discipline_name: disciplineName,
        course_code: courseCode,
      });

      if (data.success) {
        setDisciplines({
          ...disciplines,
          [disciplineName]: disciplines[disciplineName].filter(
            (course) => course !== courseCode
          ),
        });
        setError('');

        // Update validation results
        if (data.validation) {
          setValidationResults(data.validation);
        }
      }
    } catch (_) {
      setError('Failed to remove course');
    }
  };

  const searchCourses = async (query) => {
    if (!query || query.length < 2) {
      setCourseSearchResults([]);
      setShowCourseDropdown(false);
      return;
    }

    // Clear existing timeout
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    // Set a timeout to prevent too many API calls
    searchTimeout.current = setTimeout(async () => {
      setLoadingCourses(true);
      try {
        const data = await makeApiCall(`/search-courses?query=${encodeURIComponent(query)}`, 'GET');
        setCourseSearchResults(data.results || []);
        setShowCourseDropdown(data.results?.length > 0);
      } catch (err) {
        console.error('Failed to search courses:', err);
        setCourseSearchResults([]);
        setShowCourseDropdown(false);
      } finally {
        setLoadingCourses(false);
      }
    }, 300);
  };

  const handleCourseInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    setNewCourse(value);
    searchCourses(value);
  };

  const handleCourseInputFocus = () => {
    if (newCourse.length >= 2) {
      setShowCourseDropdown(true);
    }
  };

  const renderStatusIcon = (isCompleted) => {
    return isCompleted ?
      <CheckCircle className="w-5 h-5 text-green-500" /> :
      <XCircle className="w-5 h-5 text-red-500" />;
  };

  const renderRequirementStatus = (requirement) => {
    return (
      <div className="flex items-center justify-between py-2 border-b border-gray-100">
        <div className="flex-1">
          <span className="text-sm">{requirement.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${requirement.met ? 'text-green-600' : 'text-red-600'}`}>
            {requirement.actual} / {requirement.required}
          </span>
          {renderStatusIcon(requirement.met)}
        </div>
      </div>
    );
  };

  const getDisciplineStatusColor = (discipline) => {
    if (!validationResults || !validationResults.requirements.disciplines_requirements[discipline]) {
      return "border-gray-300";
    }

    const requirementsMet =
      validationResults.requirements.disciplines_requirements[discipline].course_count.met &&
      (discipline === "ISCI" || validationResults.requirements.disciplines_requirements[discipline].has_400_level.met);

    return requirementsMet ? "border-l-green-500" : "border-l-amber-500";
  };

  const is400LevelCourse = (courseCode) => {
    // Extract the numeric part of the course code
    const match = courseCode.match(/\d+/);
    if (match) {
      const courseNumber = parseInt(match[0], 10);
      return courseNumber >= 400;
    }
    return false;
  };

  // Complete CourseDropdown component implementation
  const CourseDropdown = ({ discipline, onCourseSelect, makeApiCall }) => {
    const [searchInput, setSearchInput] = useState('');
    const [results, setResults] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  
    // Use the parent's makeApiCall function
    const handleSearch = useCallback(async (query) => {
      if (!query || query.length < 2) {
        setResults([]);
        setIsOpen(false);
        return;
      }
  
      setLoading(true);
      try {
        // Use parent's makeApiCall function instead of direct fetch
        const data = await makeApiCall(`/search-courses?query=${encodeURIComponent(query)}`, 'GET');
        setResults(data.results || []); // Access the results property
        setIsOpen(data.results?.length > 0);
      } catch (err) {
        console.error('Search failed:', err);
        setResults([]);
        setIsOpen(false);
      } finally {
        setLoading(false);
      }
    }, [makeApiCall]);
  
    useEffect(() => {
      // Clear existing timeout
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
  
      // Set a timeout to prevent too many API calls
      searchTimeout.current = setTimeout(() => {
        handleSearch(searchInput);
      }, 300);
  
      return () => {
        if (searchTimeout.current) {
          clearTimeout(searchTimeout.current);
        }
      };
    }, [searchInput, handleSearch]);
  
    const handleInputChange = (e) => {
      setSearchInput(e.target.value);
    };
  
    const handleInputFocus = () => {
      if (searchInput.length >= 2) {
        setIsOpen(true);
      }
    };
  
    const handleItemClick = (courseCode) => {
      onCourseSelect(courseCode);
      setSearchInput('');
      setIsOpen(false);
    };
  
    return (
      <div className="relative w-full" ref={dropdownRef}>
        <div className="flex w-full">
          <Input
            ref={inputRef}
            value={searchInput}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            placeholder={`Search courses for ${discipline}`}
            className="flex-1"
          />
        </div>
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg"> {/* Increased z-index from z-10 to z-50 */}
            {loading ? (
              <div className="p-4 text-center text-gray-500">Searching...</div>
            ) : (
              <ul className="max-h-64 overflow-auto">
                {results.map((course) => (
                  <li
                    key={course.code}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex flex-col"
                    onClick={() => handleItemClick(course.code)}
                  >
                    <span className="font-medium">{course.code}</span>
                    <span className="text-sm text-gray-600">{course.name}</span>
                  </li>
                ))}
                {results.length === 0 && (
                  <li className="px-4 py-2 text-gray-500">No results found</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  };

  // Add this useEffect to manage the startup message visibility
  useEffect(() => {
    // Only show message for new visitors (no session ID)
    if (!sessionId) {
      setShowStartupMessage(true);
      
      // Hide message after 10 seconds
      const timer = setTimeout(() => {
        setShowStartupMessage(false);
      }, 10000);
      
      return () => clearTimeout(timer);
    } else {
      // User already has a session, don't show message
      setShowStartupMessage(false);
    }
  }, [sessionId]);

  // Add this function to update the stream
  const updateStream = async (newStream) => {
    try {
      const data = await makeApiCall('/set-stream', 'POST', {
        stream: newStream
      });
      
      if (data.success) {
        setStream(newStream);
        if (data.validation) {
          setValidationResults(data.validation);
        }
      } else {
        setError(data.message || 'Failed to update stream');
      }
    } catch (error) {
      setError('Failed to update stream');
      console.error('Error updating stream:', error);
    }
  };

  // Add this state near your other useState declarations
  const [expandedDisciplines, setExpandedDisciplines] = useState(new Set(['ISCI'])); // ISCI expanded by default

  // Add these helper functions
  const toggleDisciplineExpanded = (discipline) => {
    setExpandedDisciplines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(discipline)) {
        newSet.delete(discipline);
      } else {
        newSet.add(discipline);
      }
      return newSet;
    });
  };

  // Add these state variables near your other useState declarations
  const [collapsedDisciplines, setCollapsedDisciplines] = useState(new Set());
  const [disciplineErrors, setDisciplineErrors] = useState({}); // Store errors per discipline

  // Add helper functions for managing collapsed state
  const toggleDisciplineCollapsed = (discipline) => {
    setCollapsedDisciplines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(discipline)) {
        newSet.delete(discipline);
      } else {
        newSet.add(discipline);
      }
      return newSet;
    });
  };

  // Update the setDisciplineError function
  const setDisciplineError = (discipline, errorMessage) => {
    setDisciplineErrors(prev => ({
      ...prev,
      [discipline]: { message: errorMessage, fading: false }
    }));
    
    // Start fade out after 4 seconds (1 second before removal)
    setTimeout(() => {
      setDisciplineErrors(prev => ({
        ...prev,
        [discipline]: prev[discipline] ? { ...prev[discipline], fading: true } : undefined
      }));
    }, 4000);
    
    // Remove the error after 5 seconds total
    setTimeout(() => {
      setDisciplineErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[discipline];
        return newErrors;
      });
    }, 5000);
  };

  // Update the clearDisciplineError function
  const clearDisciplineError = (discipline) => {
    setDisciplineErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[discipline];
      return newErrors;
    });
  };

  // Resources Component
  const ResourcesTab = () => {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-blue-500" />
              ISCI Program Resources
            </CardTitle>
            <CardDescription>
              Helpful resources for planning your ISCI degree
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Official Program Information */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-700">Official Program Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-l-4 border-l-blue-500">
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-2">UBC ISCI Curriculum Requirements</h4>
                    <p className="text-sm text-gray-600 mb-3">Official program requirements and information</p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://intsci.ubc.ca/students/curriculum-requirements" target="_blank" rel="noopener noreferrer">
                        View Curriculum Requirements
                      </a>
                    </Button>
                  </CardContent>
                </Card>
                
                <Card className="border-l-4 border-l-green-500">
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-2">Proposal Guidelines</h4>
                    <p className="text-sm text-gray-600 mb-3">Detailed timeline, instructions and restrictions</p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://intsci.ubc.ca/students/curriculum-requirements" target="_blank" rel="noopener noreferrer">
                        View Proposal Guidelines
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* YouTube Video Section */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-700">Degree Planning Tool Tutorial</h3>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-4">
                  <div className="aspect-video w-full rounded-lg overflow-hidden">
                    <iframe
                      width="100%"
                      height="100%"
                      src="https://www.youtube.com/embed/p1FktTrdiNM"
                      title="ISCI Program Information"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      className="w-full h-full"
                    ></iframe>
                  </div>
                  <p className="text-sm text-gray-600 mt-3">
                    Learn how to use the degree proposal builder tool to create your ISCI degree proposal.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Planning Tips */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-700">Planning Tips</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-500" />
                      Proposal Development Tips
                    </h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Choose disciplines that complement each other</li>
                      <li>• Check prerequisites for 400-level courses</li>
                      <li>• Consider your career goals</li>
                      <li>• Develop clear rationale for course and discipline selections</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      Common Mistakes
                    </h4>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Degree proposal lacks sufficient science content</li>
                      <li>• Forgetting about honorary credit limits</li>
                      <li>• Including lower-level courses in the discipline requirement</li>
                      <li>• Curriculum Rationale that includes portions copy and pasted from the UBC calendar or websites</li>
                      <li>• Including more than 7 ISCI Credits in the ISCI core requirment</li>
                      <li>• Too many restricted courses included in disciplines</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-700">Need Help?</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-l-4 border-l-purple-500">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-xl font-medium mb-2">Integrated Science Student Association</h3>
                        <p className="text-sm text-gray-600 mb-3">Office Hours, Degree Proposal Workshops, ISCI Events</p>
                        <div className="flex gap-4">
                          <Button variant="ghost" size="sm" asChild>
                            <a href="https://ubc-issa.weebly.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                              <img 
                                src="/issa_logo.png" 
                                alt="ISSA" 
                                className="w-8 h-8 rounded-lg"
                              />
                              Our Website
                            </a>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <a href="https://instagram.com/ubcissa" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                              <img 
                                src="/Instagram_icon.png.webp" 
                                alt="Instagram" 
                                className="w-8 h-8"
                              />
                              Instagram
                            </a>
                          </Button>
                          <Button variant="ghost" size="sm" asChild>
                            <a href="https://discord.gg/Tks4HCEKX8" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1">
                              <img 
                                src="/discord_logo.webp" 
                                alt="Discord" 
                                className="w-14 h-14"
                              />
                              Discord
                            </a>
                          </Button>
                        </div>
                      </div>
                      
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="border-l-4 border-l-orange-500">
                  <CardContent className="p-4">
                    <h3 className="text-xl font-medium mb-2">Integrated Sciences Advising</h3>
                    <p className="text-sm text-gray-600 mb-3">For general program inquiries</p>
                    <Button variant="outline" size="sm" asChild>
                      <a href="https://intsci.ubc.ca/students/advising" target="_blank" rel="noopener noreferrer">Zoom Office Hours</a>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Links Section */}
        <div className="mt-6 bg-gray-100 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-2 text-gray-700">Feedback & Contributions</h3>
          <p className="text-sm text-gray-600 mb-4">
            Have suggestions, found an error, or want to contribute? Use the links below:
          </p>
          <div className="flex gap-4">
            <Button variant="outline" size="sm" asChild>
              <a href="https://github.com/Maqmood-Zafi/iscidegreeproposal" target="_blank" rel="noopener noreferrer">
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.387.6.11.82-.258.82-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.757-1.333-1.757-1.089-.744.083-.729.083-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.834 2.809 1.304 3.495.997.108-.775.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.468-2.381 1.235-3.221-.123-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.301 1.23a11.52 11.52 0 0 1 3.003-.404c1.018.005 2.042.138 3.003.404 2.292-1.552 3.301-1.23 3.301-1.23.653 1.653.241 2.873.118 3.176.768.84 1.235 1.911 1.235 3.221 0 4.61-2.803 5.625-5.475 5.921.43.372.823 1.102.823 2.222v3.293c0 .322.218.694.825.576C20.565 22.092 24 17.594 24 12.297 24 5.373 18.63.297 12 .297z" />
                </svg>
                GitHub Repository
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="mailto:muhammadhali2003@gmail.com" target="_blank" rel="noopener noreferrer">
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12.713l-11.99-7.713v13.5c0 .825.675 1.5 1.5 1.5h21c.825 0 1.5-.675 1.5-1.5v-13.5l-11.99 7.713zM12 1.5l11.99 7.713v-1.713c0-.825-.675-1.5-1.5-1.5h-21c-.825 0-1.5.675-1.5 1.5v1.713l11.99-7.713z" />
                </svg>
                Submit Suggestions/Report Bugs
              </a>
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('builder')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'builder'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } transition-colors`}
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" />
                Builder Tool
              </div>
            </button>
            <button
              onClick={() => setActiveTab('resources')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'resources'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } transition-colors`}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Resources
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto p-6">
        {activeTab === 'builder' && (
          <>
            {/* Startup notification */}
            {showStartupMessage && (
              <div className="fixed top-4 left-4 bg-blue-100 border-l-4 border-blue-500 p-5 rounded shadow-lg max-w-md z-50 animate-fade-in">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3 flex-grow">
                    <p className="text-base font-medium text-blue-800">
                      Please allow up to 90 seconds for Backend service to start up on initial load
                    </p>
                  </div>
                  <div className="ml-auto pl-3">
                    <div className="-mx-1.5 -my-1.5">
                      <button
                        onClick={() => setShowStartupMessage(false)}
                        className="inline-flex bg-blue-50 rounded-md p-1.5 text-blue-500 hover:bg-blue-100 focus:outline-none"
                      >
                        <span className="sr-only">Dismiss</span>
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Main content area */}
              <div className="w-full lg:w-2/3 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl flex items-center gap-2">
                      <LayoutDashboard className="w-6 h-6 text-blue-500" />
                      ISCI Degree Proposal Builder
                    </CardTitle>
                    <CardDescription>
                      Add disciplines and courses to build your degree proposal
                    </CardDescription>
                  </CardHeader>
                  <div className="px-6 py-4 bg-blue-50 rounded-lg mb-4">
                    <h3 className="text-lg font-semibold mb-2 text-gray-700">Stream Selection</h3>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={stream === 'regular' ? 'default' : 'outline'}
                        onClick={() => updateStream('regular')}
                        className="flex-1"
                      >
                        Regular Stream
                      </Button>
                      <Button
                        variant={stream === 'honours' ? 'default' : 'outline'}
                        onClick={() => updateStream('honours')}
                        className="flex-1"
                      >
                        Honours Stream
                      </Button>
                    </div>
                  </div>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <Input
                  value={newDiscipline}
                  onChange={(e) => setNewDiscipline(e.target.value)}
                  placeholder="Enter discipline name"
                  className="flex-1"
                />
                <Button onClick={addDiscipline} className="whitespace-nowrap">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Discipline
                </Button>
              </div>

              {disciplineOrder.map((discipline) => {
                const courses = disciplines[discipline];
                if (!courses) return null;
                
                const requirements = validationResults?.requirements?.disciplines_requirements?.[discipline];
                const isCollapsed = collapsedDisciplines.has(discipline);
                const disciplineError = disciplineErrors[discipline];
                
                return (
                  <Card
                    key={discipline}
                    className={`border-l-4 ${getDisciplineStatusColor(discipline)} shadow-sm transition-all duration-200`}
                  >
                    {/* Discipline Header */}
                    <div className="p-4 border-b border-gray-100">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <BookOpen className="w-5 h-5 text-blue-500" />
                          <h3 className="text-lg font-semibold">{discipline}</h3>
                          
                          {/* Status Badges */}
                          {requirements && (
                            <div className="flex gap-2">
                              <Badge 
                                variant={requirements.course_count.met ? "default" : "destructive"}
                                className="text-xs"
                              >
                                {requirements.course_count.actual}/{requirements.course_count.required} credits
                              </Badge>
                              
                              {discipline !== 'ISCI' && (
                                <Badge 
                                  variant={requirements.has_400_level.met ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {requirements.has_400_level.actual ? "✓" : "✗"} 400-level
                                </Badge>
                              )}
                              
                              {discipline === 'ISCI' && stream === 'honours' && (
                                <Badge 
                                  variant={disciplines[discipline]?.includes('ISCI 449') ? "default" : "destructive"}
                                  className="text-xs"
                                >
                                  {disciplines[discipline]?.includes('ISCI 449') ? "✓" : "✗"} ISCI 449
                                </Badge>
                              )}
                              
                              {/* Course count badge */}
                              <Badge variant="outline" className="text-xs">
                                {courses.length} course{courses.length !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                          )}
                        </div>
                        
                        {discipline !== 'ISCI' && (
                          <Button
                            onClick={() => removeDiscipline(discipline)}
                            variant="destructive"
                            size="sm"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      
                      {/* Discipline-specific error message with fade animation */}
                      {disciplineError && (
                        <Alert 
                          variant="destructive" 
                          className={`mt-3 ${disciplineError.fading ? 'animate-fade-out' : 'animate-fade-in'}`}
                        >
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="flex items-center justify-between">
                            <span>{disciplineError.message}</span>
                            <Button
                              onClick={() => clearDisciplineError(discipline)}
                              variant="ghost"
                              size="sm"
                              className="h-auto p-1 ml-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </Button>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    {/* Course Management Section with smooth animation */}
                    <div 
                      className={`collapse-transition ${isCollapsed ? 'collapse-exit-active' : 'collapse-enter-active'}`}
                      style={{
                        maxHeight: isCollapsed ? '0px' : '1000px',
                        opacity: isCollapsed ? 0 : 1,
                        overflow: isCollapsed ? 'hidden' : 'visible' // Only hide overflow when collapsed
                      }}
                    >
                      <div className="p-4">
                        {/* Course Search */}
                        <div className="mb-4 relative z-10"> {/* Add relative positioning and higher z-index */}
                          <CourseDropdown
                            discipline={discipline}
                            onCourseSelect={(courseCode) => addCourse(discipline, courseCode)}
                            makeApiCall={makeApiCall}
                          />
                        </div>

                        {/* Course List */}
                        <div className="flex flex-col gap-2">
                          {courses.map((course) => {
                            const courseData = courseSearchResults.find(c => c.code === course) || { code: course, name: '' };
                            const is400Level = is400LevelCourse(course);
                            
                            return (
                              <div
                                key={course}
                                className={`flex justify-between items-center p-3 ${
                                  is400Level ? 'bg-blue-50' : 'bg-gray-50'
                                } rounded-md border border-gray-200 hover:bg-gray-100 transition-colors`}
                              >
                                <div className="flex items-center gap-3 overflow-hidden flex-1">
                                  <BookMarked className={`w-4 h-4 flex-shrink-0 ${is400Level ? 'text-blue-600' : 'text-gray-500'}`} />
                                  <div className="truncate">
                                    <div className="font-medium text-gray-900">{course}</div>
                                    <div className="text-sm text-gray-600 truncate">
                                      {courseData.name || courseTitles[course] || 'Loading...'}
                                    </div>
                                  </div>
                                  {is400Level && (
                                    <Badge variant="secondary" className="text-xs ml-auto mr-2">400-level</Badge>
                                  )}
                                </div>
                                <Button
                                  onClick={() => removeCourse(discipline, course)}
                                  variant="ghost"
                                  size="icon"
                                  className="text-gray-500 hover:text-red-500"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            );
                          })}
                          
                          {courses.length === 0 && (
                            <div className="text-center py-6 text-gray-500">
                              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                              <p>No courses added yet</p>
                              <p className="text-sm">Use the search above to add courses</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Collapse/Expand Toggle Nook at Bottom */}
                    <div 
                      className="flex justify-center border-t border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => toggleDisciplineCollapsed(discipline)}
                    >
                      <div className="px-4 py-2 flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800">
                        <svg 
                          className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : 'rotate-0'}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar with real-time validation */}
      <div className="w-full lg:w-1/3 space-y-6">
        <Card className="sticky top-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Check className="w-5 h-5" />
              Requirements Status
            </CardTitle>
            <CardDescription>
              Real-time validation of your degree proposal
            </CardDescription>
          </CardHeader>
          <CardContent>
            {validationResults ? (
              <div className="space-y-4">
                {/* Overall status */}
                <div className={`p-3 rounded-md text-white ${validationResults.success ? 'bg-green-500' : 'bg-amber-500'}`}>
                  <h3 className="font-medium flex items-center gap-2">
                    {validationResults.success ? (
                      <>
                        <CheckCircle className="w-5 h-5" /> Valid Proposal
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5" /> Requirements Not Met
                      </>
                    )}
                  </h3>
                  {!validationResults.success && validationResults.messages && (
                    <ul className="mt-2 text-sm list-disc pl-5 space-y-1">
                      {validationResults.messages.map((message, index) => (
                        <li key={index}>{message}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Program Requirements */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-medium text-gray-700">Program Requirements</h3>
                    <Badge variant={stream === "honours" ? "secondary" : "outline"}>
                      {stream === "honours" ? "Honours Stream" : "Regular Stream"}
                    </Badge>
                  </div>
                  <div className="space-y-1 bg-gray-50 p-3 rounded-md">
                    {renderRequirementStatus({
                      label: "ISCI Credits",
                      required: validationResults.requirements.isci_credits.required,
                      actual: validationResults.requirements.isci_credits.actual.toFixed(1),
                      met: validationResults.requirements.isci_credits.met
                    })}

                    {renderRequirementStatus({
                      label: "Total Discipline Credits",
                      required: validationResults.requirements.total_credits.required,
                      actual: validationResults.requirements.total_credits.actual.toFixed(1),
                      met: validationResults.requirements.total_credits.met
                    })}

                    {renderRequirementStatus({
                      label: "Science Credits (Total)",
                      required: validationResults.requirements.science_credits.required,
                      actual: validationResults.requirements.science_credits.actual.toFixed(1),
                      met: validationResults.requirements.science_credits.met
                    })}

                    {renderRequirementStatus({
                      label: "Science Credits (Non-ISCI)",
                      required: validationResults.requirements.non_isci_science_credits.required,
                      actual: validationResults.requirements.non_isci_science_credits.actual.toFixed(1),
                      met: validationResults.requirements.non_isci_science_credits.met
                    })}

                    {renderRequirementStatus({
                      label: "Honorary Science Credits (Max)",
                      required: validationResults.requirements.honorary_credits.required,
                      actual: validationResults.requirements.honorary_credits.actual.toFixed(1),
                      met: validationResults.requirements.honorary_credits.met
                    })}

                    {renderRequirementStatus({
                      label: "400-level Courses (Total)",
                      required: validationResults.requirements.total_400_level.required,
                      actual: validationResults.requirements.total_400_level.actual,
                      met: validationResults.requirements.total_400_level.met
                    })}
                  </div>
                </div>

              </div>
            ) : (
              <div className="p-6 text-center">
                <p className="text-gray-500">Loading validation data...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
          </>
        )}

        {activeTab === 'resources' && <ResourcesTab />}
      </div>
    </div>
  );
};

export default DegreeProposal;